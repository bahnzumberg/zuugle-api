import express from 'express';
import bodyParser from 'body-parser';
import path  from 'node:path';
import cors from 'cors';
import tours from './routes/tours';
import cities from './routes/cities';
import regions from './routes/regions';
import ranges from './routes/ranges';
import language from './routes/language';
import authenticate from "./middlewares/authenticate";
import share from "./routes/share";
import {BrowserService} from "./utils/pdf/BrowserService";
import {getZuugleCors, hostMiddleware} from "./utils/zuugleCors";
import searchPhrases from "./routes/searchPhrases";
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import middleware from 'i18next-http-middleware';
import 'dotenv/config' ;
// import fs from 'node:fs';
// import trans from '../locales/de/translation.json'

// console.log("dirname : ", __dirname)
// console.log("process.cwd()   :",process.cwd())
// const root = process.cwd();
// const enTransfile = fs.readFileSync(path.join(process.cwd(), '/locales/de/translation.json')); //
// const enTransfile = fs.readFileSync(path.resolve('/Users/falsalih/Documents/ACTIVEFILE/Zuugle-new-version-detail/zuugle-api/locales/de/translation.json')); //works
//const enTransfile = fs.readFileSync(path.join(__dirname, '/locales/en/translation.json')); // not work..../zuugle-api/src/locales/en/translation.json'

// const parsedTransFile = JSON.parse(enTransfile);
// console.log("parsedTransFile :", parsedTransFile);

// console.log('L22 Resolved loadpath:', path.resolve('/Users/falsalih/Documents/ACTIVEFILE/Zuugle-new-version-detail/zuugle-api/locales/{{lng}}/translation.json'));


i18next.use(Backend).use(middleware.LanguageDetector).init({
    initImmediate: true ,
    lng: 'en',
    // load: 'languageOnly',
    debug : false,
    preload: ['en', 'fr', 'de', 'en-GB'],
    load: 'all',
    supportedLngs: ['en', 'en-GB', 'en-US', 'fr', 'de'],
    // ns: ['translation'],
    // defaultNS: 'translation',
    fallbacklng: false,
    resources:{
        "de": {
            "translation": {
                "bahnhof": "Bahnhof",
                "std_mit_nach":"{{CD}} Std mit {{connectionType}} {{CN}} nach",
            }
        },
        "en-GB":{
            "translation": {
                "bahnhof": "Railway station",
                "std_mit_nach":"{{CD}} h with {{connectionType}} {{CN}} to"
            }
        },
        "en":{
            "translation": {
                "bahnhof": "Railway station",
                "std_mit_nach":"{{CD}} h with {{connectionType}} {{CN}} to"
            }
        },
        "fr": {
            "translation": {
            "bahnhof": "Gare ferroviaire",
            "std_mit_nach": "{{CD}} h avec {{connectionType}} {{CN}} à"
            }
        }
    },


    // backend:{    // *********  REMOVE AND INSERT THE TABLE ENTRIES UNDER "resources" ***********

    //     // loadpath: './locales/{{lng}}/translation.json'
    //     // loadpath: 'locales/{{lng}}/translation.json'
    //     // loadpath: '../locales/{{lng}}/{{ns}}/translation.json'
    //     // loadpath: `http://localhost:8080/api/locales/{{lng}}/{{ns}}/translation.json`
    //     // loadpath: path.resolve(__dirname, '/locales/{{lng}}/translation.json')
    //     loadpath: path.resolve(process.cwd(), '/locales/{{lng}}/translation.json')
    // }

}, (err, t) => {
    // if(err){throw new Error(err);}
    if(err) {
        console.log("Error log starts here :");
        // console.log(err);
    }
    // console.log("bahnhof is : ",t('bahnhof'));
    console.log("bahnhof is : ",t('bahnhof',{lng: 'fr'}));
    }
)

process.env.TZ = 'Europe/Berlin';

/* start api */
let port = 8080;
if(process.env.NODE_ENV === "production"){
    if(!!process.env.NODE_PORT){
        port = 8080;
    }
    else {
        port = 6060;
    }
}

console.log("port :", port)

let corsOptions = getZuugleCors();

let app = express();

app.use(middleware.handle(i18next));

process.setMaxListeners(0);
app.use(bodyParser.json({limit: '1024mb'}));
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.json({limit: '1024mb'}));
app.use(express.urlencoded({limit: '1024mb',extended: false}));

// preflight options requests for json files fail otherwise
app.options("/public/*", cors(corsOptions));
//static file access
app.use("/public", cors(corsOptions), express.static('public'));

app.use('/api/tours', cors(corsOptions), hostMiddleware, authenticate, tours);
app.use('/api/cities', cors(corsOptions), hostMiddleware, authenticate, cities);
app.use('/api/regions', cors(corsOptions), hostMiddleware, authenticate, regions);
app.use('/api/ranges', cors(corsOptions), hostMiddleware, authenticate, ranges);
app.use('/api/language', cors(corsOptions), hostMiddleware, authenticate, language);
app.use('/api/searchPhrases', cors(corsOptions), hostMiddleware, authenticate, searchPhrases);
app.use('/api/shares', cors(corsOptions), hostMiddleware, authenticate, share);


app.listen(port, () => console.log('Running on localhost:' + port));

(async () => {
    await BrowserService.getInstance();
})();

process.on ('SIGTERM', async () => {
    await shutdownBrowser();
});
process.on ('SIGINT', async () => {
    await shutdownBrowser();
});
process.on('exit',  async () => {
    await shutdownBrowser();
});

if(process.env.NODE_ENV !== "production"){
    process.once('SIGUSR2', async function () {
        await shutdownBrowser();
        process.kill(process.pid, 'SIGUSR2');
    });
}

const shutdownBrowser = async () => {
    try {
        const instance = await BrowserService.getInstance();
        if(!!instance){
            const browser = instance.getBrowser();
            if(!!browser){
                await browser.close();
                console.log('pupeteer browser successfully closed...')
            }
        }
    } catch(e){
        console.log('error closing pupeteer browser: ', e)
    }
}

