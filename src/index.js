import express from 'express';
// import bodyParser from 'body-parser';
import cors from 'cors';
import tours from './routes/tours';
import cities from './routes/cities';
import language from './routes/language';
import authenticate from "./middlewares/authenticate";
import {getZuugleCors, hostMiddleware} from "./utils/zuugleCors";
import searchPhrases from "./routes/searchPhrases";

process.env.TZ = 'Europe/Berlin';

/* start api */
let port = 8080;
console.log("__dirname=", __dirname)
console.log("process.env.NODE_ENV", process.env.NODE_ENV)

if(process.env.NODE_ENV === "production"){
    if (__dirname.includes("/dev-api")) {
        port = 7070;
    }
    else {
        port = 6060;
    }
}

let corsOptions = getZuugleCors();

let app = express();

process.setMaxListeners(0);
// app.use(bodyParser.json({limit: '1024mb'}));
// app.use(bodyParser.urlencoded({extended: false}));
app.use(express.json({limit: '1024mb'}));
app.use(express.urlencoded({limit: '1024mb',extended: false}));

// preflight options requests for json files fail otherwise
app.options("/public/*", cors(corsOptions));
//static file access
app.use("/public", cors(corsOptions), express.static('public'));

app.use('/api/tours', cors(corsOptions), hostMiddleware, authenticate, tours);
app.use('/api/cities', cors(corsOptions), hostMiddleware, authenticate, cities);
app.use('/api/language', cors(corsOptions), hostMiddleware, authenticate, language);
app.use('/api/searchPhrases', cors(corsOptions), hostMiddleware, authenticate, searchPhrases);


app.listen(port, () => console.log('Running on localhost:' + port));