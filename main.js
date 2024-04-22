import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Привет! Я бот, который помогает создавать образы на основе твоего стиля и предпочтений. Отправь мне изображение своей одежды как фотографию (не файлом), и я подберу для тебя различные образы. Начни с отправки фотографии.");
});

// Обработка загруженных как файл изображений
bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Пожалуйста, загружай изображения как фотографию, а не как файл. Это поможет мне лучше обработать запрос.");
});

bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  try {
    const photo = msg.photo[0];
    const fileId = photo.file_id;
    const fileUrl = await bot.getFileLink(fileId);
    const response = await openai.chat.completions.create({
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
          {"outfits": [{"name": "Название на русском", "description": "Описание ", "base": "Описание вещи которая представленна на фотографии(Её не надо заносить в items)" "items": ["Вещь с хорошим описанием, чтобы можно было найти такую на маркетплейсах", ... ]},...]}`,
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

    // Отправка ответа
    bot.sendMessage(chatId, response.choices[0].message.content);
  } catch (error) {
    console.error(error);
    bot.sendMessage(
      chatId,
      "Ошибка при обработке изображения или запроса к ChatGPT"
    );
  }
});
