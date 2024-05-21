#!/usr/bin/node
import {syncConnectionGPX, syncGPX, syncGPXImage} from "./sync";
import moment from "moment";


console.log('START CREATE GPX FILES: ', moment().format('HH:mm:ss'));
syncGPX().then(res => {
    console.log('END CREATE GPX FILES: ', moment().format('HH:mm:ss'));
    console.log('START CREATE GPX ANREISE/ABREISE FILES: ', moment().format('HH:mm:ss'));
    syncConnectionGPX('prod').then(res1 => {
        console.log('END CREATE GPX ANREISE/ABREISE FILES: ', moment().format('HH:mm:ss'));
        console.log('START CREATE GPX IMAGE FILES: ', moment().format('HH:mm:ss'));
        syncGPXImage().then(res2 => {
            console.log('END CREATE GPX IMAGE FILES: ', moment().format('HH:mm:ss'));
            process.exit();
        })
    })
})

