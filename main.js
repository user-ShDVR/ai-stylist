import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import fs from 'fs/promises';
import OpenAI from "openai";
import { fetchAndWriteData } from "./wbSearch.js";
import axios from "axios";

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Привет! Я бот, который помогает создавать образы на основе твоего стиля и предпочтений. Отправь мне изображение своей одежды как фотографию (не файлом), и я подберу для тебя различные образы. Начни с отправки фотографии."
  );
});

// Обработка загруженных как файл изображений
bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Пожалуйста, загружай изображения как фотографию, а не как файл. Это поможет мне лучше обработать запрос."
  );
});

bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  try {
    const photo = msg.photo[0];
    const fileId = photo.file_id;
    const fileUrl = await bot.getFileLink(fileId);
    const responseImage = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
          Твоя задача - подобрать для пользователя одежду с товарами-компонентами и аксессуарами.
          Оталкивайся от типа одежды который дали на изображении.
          Если на изображении тапки то не надо к этим тапкам придумывать деловой стиль, лучше если предложить пляжный стиль.
          Обязательно проверяй если на картинке нет одежды, то в ответе должна быть сообщение "Ничего не нашлось".
          Иначе отвечай в формате json вида:
          {outfits: [{name: "Название на русском", description: "Описание", base: "Описание вещи которая представленна на фотографии(Её не надо заносить в items)" items: ["Вещь с хорошим описанием, чтобы можно было найти такую на маркетплейсах", ... ]},...]}`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `У меня есть такая одежда, подбери мне 4 различных образа с товарами-компонентами и аксессуарами к ним(в каждом образе по 5 вещей), чтобы образы подходили к моей фигуре.`,
            },
            {
              type: "image_url",
              image_url: {
                url: fileUrl,
              },
            },
          ],
        },
      ],
    });

    const data = JSON.parse(responseImage.choices[0].message.content)
    console.log(data);
    const promises = data.outfits.map(async (outfit) => {
      const itemDetails = await Promise.all(
        outfit.items.map(async (item) => await fetchAndWriteData(item))
      );
      return {
        ...outfit,
        items: itemDetails.filter((item) => item !== null),
      };
    });

    const wbResponse = await Promise.all(promises);

    const outfitsDescriptions = await wbResponse.map(async (outfit) => {
      const validItems = await filterValidImages(outfit.items);
      // Создаем массив сообщений для каждого образа
      const messages = validItems.map((item) => ({
        type: "image_url",
        image_url: { url: item.imageUrl },
      }));
      return {
        systemMessage: {
          role: "system",
          content: `
        Твоя задача - по загруженным картинкам сделать текстовое описание образа.
        Описание должно начинаться с "woman" и заканчиваться "in front of soft shadows on circular platform".
        После woman описывай сначала основной элемент одежды, потом описывай его компаньонов.
        Если картинка не содержит в себе одежды или товаров компаньонов то не добавляй её в образ
      `,
        },
        userMessage: {
          role: "user",
          content: [
            {
              type: "text",
              text: `woman ${outfit.base} in front of soft shadows on circular platform. ${outfit.description}`,
            },
            ...messages,
          ],
        },
      };
    });

    // Пример функции для отправки данных в OpenAI
    async function sendDescriptionsToChatGPT(outfitDescriptions) {
      try {
          const responses = await Promise.all(
              outfitDescriptions.map(async (descriptionPromise) => {
                  const description = await descriptionPromise; // Убедитесь, что промис разрешен
                  await writeToFile('./outputs/description.txt', JSON.stringify(description) + '\n');
                  if (!description || !description.systemMessage || !description.userMessage) return null; // Проверка на null и наличие необходимых полей
  
                  const response = await openai.chat.completions.create({
                      model: "gpt-4-turbo",
                      messages: [
                          description.systemMessage,
                          description.userMessage // Убедитесь, что userMessage также формируется корректно
                      ],
                  });
                  return response;
              })
          );
          return responses.map((response) => response.choices[0].message.content);
      } catch (error) {
          await writeToFile('./outputs/errors.txt', `Ошибка при отправке данных в OpenAI: ${error}\n`); // Запись ошибки в файл
      }
  }
  

    // Вызываем функцию отправки данных
    const responseArr = await sendDescriptionsToChatGPT(outfitsDescriptions);
    const images = responseArr.map(async (response) => {
      await FlairImgGenerator(response);
    });
    console.log("Done!");
    console.log(wbResponse);
    // Отправка ответа
    // bot.sendMessage(chatId, response.choices[0].message.content);
  } catch (error) {
    console.error(error);
    bot.sendMessage(
      chatId,
      "Ошибка при обработке изображения или запроса к ChatGPT"
    );
  }
});

async function checkImageUrl(url) {
  try {
      const response = await axios.head(url); // Отправляем запрос HEAD к URL
      const contentType = response.headers["content-type"]; // Получаем тип содержимого
      return (
          response.status === 200 && contentType && contentType.includes("image")
      ); // Проверяем статус и тип контента
  } catch (error) {
      // console.error("Ошибка при проверке URL изображения");
      return false; // В случае ошибки считаем URL невалидным
  }
}


// Пример использования
async function filterValidImages(items) {
  const results = await Promise.all(
    items.map((item) =>
      checkImageUrl(item.imageUrl).then((isValid) => (isValid ? item : null))
    )
  );
  return results.filter((item) => item !== null); // Отфильтровываем null значения
}


async function writeToFile(fileName, data) {
  try {
      await fs.writeFile(fileName, data, { flag: 'a' }); // Флаг 'a' для добавления данных в конец файла
  } catch (error) {
      console.error('Ошибка при записи в файл:', error);
  }
}

async function FlairImgGenerator(prompt) {
    const api_key = process.env.FLAIR_TOKEN;
    const url = "https://api.flair.ai/generate-image/v1";
    
    try {
        const response = await axios.post(url, {
            pipeline_type: "default",
            prompt,
            negative_prompt: "blurry, cropped, ugly, chaotic, random, colorful, cluttered, distorted, drawing, painting, graphic design, 3d rendering, fake, plastic",
            guidance_scale: 7.5,
            num_inference_steps: 25,
            width: 1024,
            height: 1024,
            seed: 42,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'API-Key': api_key
            }
        });

        if (response.status === 200) {
            console.log(response.data.images);
            // return response.data.images;
        } else {
            console.error('Error:', response.status, response.data);
        }
    } catch (error) {
        console.error('Error:', error.response || error.request || error.message);
    }
}
