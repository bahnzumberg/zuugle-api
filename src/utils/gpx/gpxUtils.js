const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs-extra');
let sharp = require('sharp');
const convertXML = require('xml-js');
const { create, builder } = require('xmlbuilder2');
import moment from "moment";
import {hashString, minutesFromMoment} from "../../utils/helper";
import {setTimeout} from "node:timers/promises";

const minimal_args = [
    '--autoplay-policy=user-gesture-required',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--disable-domain-reliability',
    '--disable-extensions',
    '--disable-features=AudioServiceOutOfProcess',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-notifications',
    '--disable-offer-store-unmasked-wallet-cards',
    '--disable-popup-blocking',
    '--disable-print-preview',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-setuid-sandbox',
    '--disable-speech-api',
    '--disable-sync',
    '--hide-scrollbars',
    '--ignore-gpu-blacklist',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check',
    '--no-first-run',
    '--no-pings',
    '--no-sandbox',
    '--no-zygote',
    '--password-store=basic',
    '--use-gl=swiftshader',
    '--use-mock-keychain',
];


export const createImagesFromMap = async (ids) => {
    if(!!ids){
        let browser;
        try {

            let addParam = {};
               if(process.env.NODE_ENV == "production"){
                addParam.executablePath = path.resolve(__dirname,'../../node_modules/puppeteer/.local-chromium/linux-1022525/chrome-linux/chrome')
            }

            browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1200,800', ...minimal_args],
                defaultViewport: {width: 1200, height: 800},
                ...addParam
            });

            let url = process.env.NODE_ENV === "production" ? 
            "https://www.zuugle.at/public/headless-leaflet/index.html?gpx=https://www.zuugle.at/public/gpx/" 
            :
            "http://localhost:8080/public/headless-leaflet/index.html?gpx=http://localhost:8080/public/gpx/";
        


            const chunkSize = 10;
            let counter = 1;
            for (let i = 0; i < ids.length; i += chunkSize) {
                const chunk = ids.slice(i, i + chunkSize);
                await Promise.all(chunk.map(ch => new Promise(async resolve => {

                    let filePath = undefined;
                    let filePathSmall = undefined;
                    if(process.env.NODE_ENV == "production"){
                        filePath = path.join(__dirname, "../../", "public/gpx-image/"+ch+"_gpx.jpg");
                        filePathSmall = path.join(__dirname, "../../", "public/gpx-image/"+ch+"_gpx_small.jpg");
                    } else {
                        filePath = path.join(__dirname, "../../../", "public/gpx-image/"+ch+"_gpx.jpg");
                        filePathSmall = path.join(__dirname, "../../../", "public/gpx-image/"+ch+"_gpx_small.jpg");
                    }

                    const today = moment().format('D');
                    const hash_day = hashString(ch) % 30 + 1;
                    if (today == hash_day) {
                        try {
                            fs.unlinkSync(filePath);
                        } catch(err) {
                            // console.log("createImagesFromMap unlinkSync filePath: " + err.message);
                        }
                        try {
                            fs.unlinkSync(filePathSmall);
                        } catch(err) {
                            // console.log("createImagesFromMap unlinkSync filePathSmall: " + err.message);
                        }
                    }
                    
                    if (!!filePath && !!!fs.existsSync(filePath)) {
                        await createImageFromMap(browser, filePath, url + ch + ".gpx", 80);
                        if(process.env.NODE_ENV !== "production"){
                            // console.log('Big generated successfully: ', filePath);
                        }

                        try {
                            await sharp(filePath).resize({
                                width: 600,
                                height: 400,
                                fit: "inside"
                            }).jpeg({quality: 30}).toFile(filePathSmall);
                            if(process.env.NODE_ENV !== "production"){
                                // console.log('Small generated successfully: ', filePathSmall);
                            }
                        } catch(e){
                            if(process.env.NODE_ENV !== "production"){
                                console.error("Line 96: gpxUtils error :",e);
                            }
                        }
                    }
                    
                    counter++;
                    resolve();
                })));
            }
        } catch (err) {
            console.log("Error Line 105 -->",err.message);
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }
}




export const createImageFromMap = async (browser, filePath,  url, picquality) => {
    try {
        if(!!filePath){
            if(process.env.NODE_ENV !== "production"){
                console.log('createImageFromMap , L127 gpxUtils, filePath :', filePath, ' URL : ', url, ' picquality :', picquality);
            }
            const page = await browser.newPage();
            await page.emulateMediaType('print'); 
            await page.setCacheEnabled(false);
            await page.goto(url, { timeout: 30000, waitUntil: 'networkidle0' }); 
            await page.waitForTimeout(10);
            await page.bringToFront();
            await page.screenshot({path: filePath, type: "jpeg", quality: picquality});
            await page.close();
        }
    } catch (err) {
        console.log('createImageFromMap error with url=',url, ' error:', err.message);
    }
}


export const createSingleImageFromMap = async (providerhashedUrl, fromTourTrackKey, toTourTrackKey, template = "index.html", fileNamePostfix = "", addBaseGpx = true) => {
    let browser = null;
    try {

        let LEAFLET_BASE =  process.env.NODE_ENV === "production" ?     `https://www.zuugle.at/public/headless-leaflet/${template}` 
        :                                                               `http://localhost:8080/public/headless-leaflet/${template}`;

        let BASE_GPX_URL =  process.env.NODE_ENV === "production" ?     "https://www.zuugle.at/public/gpx/" 
        :                                                                "http://localhost:8080/public/gpx/";

        let BASE_GPX_TRACK_URL = process.env.NODE_ENV === "production" ? "https://www.zuugle.at/public/gpx-track/" 
        :                                                                "http://localhost:8080/public/gpx-track/";

        let url = "";

        url = LEAFLET_BASE + (!!addBaseGpx ? "?gpx=" + BASE_GPX_URL + providerhashedUrl + ".gpx" : "");

        if(!!fromTourTrackKey){
            url = url + (!!addBaseGpx ? "&" : "?") + "gpx1=" + BASE_GPX_TRACK_URL + "fromtour_track_" + fromTourTrackKey + ".gpx";
        }
        if(!!toTourTrackKey){
            url = url + (!!addBaseGpx ? "&" : "?") + "gpx2=" + BASE_GPX_TRACK_URL + "totour_track_" + toTourTrackKey + ".gpx";
        }

        let addParam = {};
        if(process.env.NODE_ENV == "production"){
            addParam.executablePath = path.resolve(__dirname,'../../node_modules/puppeteer/.local-chromium/linux-1022525/chrome-linux/chrome')
        }

        let filePath = undefined;
        let baseFilePath = "public/gpx-image-with-track/"+providerhashedUrl+ "_"+ getValidUndefinedFileName(toTourTrackKey) + "_" + getValidUndefinedFileName(fromTourTrackKey) + fileNamePostfix +"_gpx.jpg";
        if(process.env.NODE_ENV == "production"){
            filePath = path.join(__dirname, "../../", baseFilePath);
        } else {
            filePath = path.join(__dirname, "../../../", baseFilePath);
        }

        if (!!filePath && !!fs.existsSync(filePath)) {
            return baseFilePath;
        }

        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1200,800', ...minimal_args],
            defaultViewport: {width: 1200, height: 800},
            ...addParam
        });

        if(!!filePath){
            const page = await browser.newPage();

            await page.emulateMediaType('print');
            await page.setCacheEnabled(false);
            await page.goto(url, { timeout: 1000000, waitUntil: 'networkidle0' });
            // await page.waitForTimeout(20);
            await setTimeout(20);
            await page.bringToFront();
            await page.screenshot({path: filePath, type: "jpeg", quality: 90});
            await page.close();
            return baseFilePath;
        }

    } catch (err) {
        console.log('createSingleImageFromMap error: ', err);
        console.log(err.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

const getValidUndefinedFileName = (entry) => {
    if(!!entry){
        return entry;
    } else {
        return "unknown"
    }
}

export const mergeGpxFilesToOne = async (fileMain, fileAnreise, fileAbreise) => {
    let trackAnreise = await getSequenceFromFile(fileAnreise);
    let trackAbreise = await getSequenceFromFile(fileAbreise);
    try {
        if(!!fileMain){
            const fileContent = await fs.readFile(fileMain, 'utf-8');
            let json = convertXML.xml2js(fileContent);
            if(json && json.elements.length > 0 && json.elements[0].elements){
                if(!!trackAnreise && trackAnreise.elements){
                    json.elements[0].elements.splice(0, 0, trackAnreise );
                }
                if(!!trackAbreise && trackAbreise.elements){
                    json.elements[0].elements.push(trackAbreise);
                }
            }
            const doc = create(convertXML.js2xml(json));
            return doc.end({prettyPrint: true});
        }
    } catch(e){
        console.error(e);
    }

    return null;
}

const getSequenceFromFile = async (file) => {
    try {
        const fileContent = await fs.readFile(file, 'utf-8');
        if(!!fileContent){
            const jsObj = convertXML.xml2js(fileContent);
            if(!!jsObj && jsObj.elements.length > 0 && jsObj.elements[0].elements.length > 0){
                const found = jsObj.elements[0].elements[0];   
                return found;
            }
        }
    } catch(e){
        console.error(e);
    }
    return null;
}
