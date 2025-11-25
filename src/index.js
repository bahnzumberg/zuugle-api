import express from 'express';
// import bodyParser from 'body-parser';
import cors from 'cors';
import tours from './routes/tours';
import cities from './routes/cities';
import language from './routes/language';
import authenticate from "./middlewares/authenticate";
import { getZuugleCors, hostMiddleware } from "./utils/zuugleCors";
import searchPhrases from "./routes/searchPhrases";
import { standardLimiter, searchLimiter } from "./middlewares/rateLimiter";

process.env.TZ = 'Europe/Berlin';

/* start api */
let port = 8080;

// Fixed: Only log in development mode to prevent sensitive data exposure
if (process.env.NODE_ENV !== "production") {
    console.log("__dirname=", __dirname)
    console.log("process.env.NODE_ENV", process.env.NODE_ENV)
}

if (process.env.NODE_ENV === "production") {
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
// Fixed: Reduced payload limit from 1024mb to 100mb for security
// 100mb allows for map view with 40k datapoints (~15mb) with safety margin
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: false }));

// preflight options requests for json files fail otherwise
app.options("/public/*", cors(corsOptions));
//static file access
app.use("/public", cors(corsOptions), express.static('public'));

// Fixed: Added rate limiting to all API endpoints
app.use('/api/tours', cors(corsOptions), hostMiddleware, standardLimiter, authenticate, tours);
app.use('/api/cities', cors(corsOptions), hostMiddleware, standardLimiter, authenticate, cities);
app.use('/api/language', cors(corsOptions), hostMiddleware, standardLimiter, authenticate, language);
app.use('/api/searchPhrases', cors(corsOptions), hostMiddleware, searchLimiter, authenticate, searchPhrases);


app.listen(port, () => console.log('Running on localhost:' + port));