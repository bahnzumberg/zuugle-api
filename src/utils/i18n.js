import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import middleware from 'i18next-http-middleware';

// const supportedLanguages = ['en','de','sl','fr','it'];
const supportedLanguages = ['en','de','fr'];

i18next.use(Backend).use(middleware.LanguageDetector).init({
    initImmediate: false ,
    // lng: 'en', // this turns off language detector
    // load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    debug : true,
    preload: ['en', 'fr', 'de'],
    load: 'all',
    supportedLanguages: supportedLanguages,
    // ns: ['translation'],  // chenge this if other than "translation"
    // defaultNS: 'translation',
    fallbacklng: "de",
    interpolation: {
        spaceValue: false,
        formatSeperator: ",",
      },
    resources:{
        "de": {
            "translation": {
                "bahnhof": "Bahnhof",
                "std_mit_nach":"{{CD}} Std mit {{connectionType}} {{CN}} nach",
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
        },
        "dev": {
            "translation": {
            "bahnhof": "dev_Bahnhof",
            }
        }
    },



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

export default i18next;