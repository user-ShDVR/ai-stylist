import * as https from 'https';

class GenerateImgUrl {
    nmId;
    size;
    number;
    format;

    constructor({ nmId, size, number, format }) {
        this.nmId = nmId;
        this.size = size ?? "big";
        this.number = number ?? 1;
        this.format = format ?? "webp";
    }

    getHost(id) {
        const urlParts = [
            { range: [0, 143], url: "//basket-01.wb.ru" },
            { range: [144, 287], url: "//basket-02.wb.ru" },
            { range: [288, 431], url: "//basket-03.wb.ru" },
            { range: [432, 719], url: "//basket-04.wb.ru" },
            { range: [720, 1007], url: "//basket-05.wb.ru" },
            { range: [1008, 1061], url: "//basket-06.wb.ru" },
            { range: [1062, 1115], url: "//basket-07.wb.ru" },
            { range: [1116, 1169], url: "//basket-08.wb.ru" },
            { range: [1170, 1313], url: "//basket-09.wb.ru" },
            { range: [1314, 1601], url: "//basket-10.wb.ru" },
            { range: [1602, 1655], url: "//basket-11.wb.ru" },
            { range: [1656, 1919], url: "//basket-12.wb.ru" },
            { range: [1920, 2045], url: "//basket-13.wb.ru" },
            { range: [2046, Infinity], url: "//basket-14.wb.ru" }
        ];

        const url = urlParts.find(
            ({ range }) => id >= range[0] && id <= range[1]
        );
        return url;
    }

    url(){
        const vol = ~~(this.nmId / 1e5),
            part = ~~(this.nmId / 1e3);
        return `https:${this.getHost(vol)?.url}/vol${vol}/part${part}/${
            this.nmId
        }/images/${this.size}/${this.number}.${this.format}`;
    }
}

export async function fetchAndWriteData(query) {
    const url = `https://search.wb.ru/exactmatch/ru/common/v5/search?appType=2&curr=rub&dest=-1257786&query=${query}&resultset=catalog&sort=popular&spp=30&suppressSpellcheck=false`;
    try {
        const data = await fetchData(url);
        if (!data) {
            console.error(`No products found for query: ${query}`);
            return null;
        }
        const product = parseData(data);
        if (!product) {
            console.error(`No products found for query: ${query}`);
            return null;
        }

        return product;
    } catch (error) {
        console.error(error);
    }
}

function fetchData(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

function parseData(data) {
    const productsArray = data.data.products;
    if (productsArray.length === 0) {
        return null;
    }

    const item = productsArray.shift(); 
    const imgUrlGenerator = new GenerateImgUrl({ nmId: item.id });
    console.log(item);
    const product = {
        name: item.name,
        imageUrl: imgUrlGenerator.url(),
        productUrl: `https://www.wildberries.ru/catalog/${item.id}/detail.aspx`,
        id: item.id
    };

    console.log(product);
    return product;
}


fetchAndWriteData('ботинки женские чёрные на молнии');