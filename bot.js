// Load pre-requirements
import fs from 'fs';
import yaml from 'js-yaml';
import RssParser from 'rss-parser';
import got from 'got';

// Initialize with settings
const confContents = fs.readFileSync('config.yml', 'utf8');
const confData = yaml.safeLoad(confContents);

// Set global objects
const rss = new RssParser();

// Setup pictures send list
const sendList = [];

// Configure processors
const processors = {
    // Input: object data
    // Output: Array of [preview *link* + *pic* + introduce *text* + original *url*]
    // Return: New Timestamp
    pixiv: (data, timestamp) => {
        let newTimeStamp = timestamp;
        // Set regexp for getting artworks
        const picIdReg = /https:\/\/pixiv\.cat\/(\d+)-?(\d+)?\.(jpg|png|gif)/gi;
        data.items.forEach((item) => {
            // Set publish time
            const pubTime = new Date(item.isoDate);
            if (pubTime > timestamp) {
                // New post
                if (pubTime > newTimeStamp) {
                    // Record latest post time
                    newTimeStamp = pubTime;
                }
                // Japan : Tokyo GMT + 9
                const pubTime_JP = new Date(pubTime.getTime() + 9 * 3600 * 1000);
                const pubTimeString = `${pubTime_JP.getFullYear()}/${pubTime_JP.getMonth() + 1}/${pubTime_JP.getDate()}/${pubTime_JP.getHours()}/${pubTime_JP.getMinutes()}/${pubTime_JP.getSeconds()}`;

                // Get ready to post these pictures
                const artworks = [...item.content.matchAll(picIdReg)];
                if (artworks.length === 1) {
                    // Single post
                    sendList.push({
                        preview: `https://i.pximg.net/img-master/img/${pubTimeString}/${artworks[0][1]}_p0_master1200.${artworks[0][3]}`,
                        pic: artworks[0][0],
                        text: item.title,
                        url: `https://www.pixiv.net/artworks/${artworks[0][1]}`
                    });
                } else {
                    // Multiple posts
                    artworks.forEach((pic) => {
                        sendList.push({
                            preview: `https://i.pximg.net/img-master/img/${pubTimeString}/${pic[1]}_p${pic[2] - 1}_master1200.${pic[3]}`,
                            pic: pic[0],
                            text: item.title + ' - P' + pic[2],
                            url: `https://www.pixiv.net/artworks/${pic[1]}`
                        });
                    });
                }
            }
        });
        return newTimeStamp;
    },
    yandere: (data, timestamp) => {
        let newTimeStamp = timestamp;
        // Set regexp for getting artworks
        const picIdReg = /https:\/\/files.yande.re\/sample\/(\S+)\/(\S+)\.(jpg|png|gif)/gi;
        data.items.forEach((item) => {
            // Set publish time
            const pubTime = new Date(item.isoDate);
            if (pubTime > timestamp) {
                // New post
                if (pubTime > newTimeStamp) {
                    // Record latest post time
                    newTimeStamp = pubTime;
                }
                const artworks = [...item.content.matchAll(picIdReg)];
                const link_raw = artworks[0][0];
                const link_full = link_raw.replace('%20sample', '').replace('sample', 'image');
                sendList.push({
                    preview: link_raw,
                    pic: link_full,
                    text: 'Tags: ' + item.title,
                    url: item.link
                });
            }

        });
        return newTimeStamp;
    }
};

// Setup check list
const checklist = [];

confData.feed.forEach((item) => {
    switch (item.type) {
        case 'pixiv':
            checklist.push({
                url: item.url,
                proc: processors.pixiv,
                timestamp: Date.now()
            });
            break;
        case 'yandere':
            checklist.push({
                url: item.url,
                proc: processors.yandere,
                timestamp: Date.now()
            });
            break;
        default:
            console.error('Unsupported type : ' + item.type);
            break;
    }
});

const apiBaseUrl = `https://api.telegram.org/bot${confData.bot.token}`;
const sendPic = (picItem) => {
    got('sendPhoto', {
        method: 'POST',
        prefixUrl: apiBaseUrl,
        json: {
            chat_id: confData.bot.chat,
            photo: picItem.preview,
            caption: picItem.text,
            reply_markup: {
                inline_keyboard: [
                    [{
                        text: '🌏',
                        url: picItem.url
                    }, {
                        text: '⤵',
                        url: picItem.pic
                    }]
                ]
            }
        }
    });

};

const checkRss = () => {
    checklist.forEach((item) => {
        rss.parseURL(item.url, (err, feed) => {
            if (err) {
                console.error(err);
            } else {
                item.timestamp = item.proc(feed);
            }
        });
    });
};

const checkSendList = () => {
    if (sendList.length > 0) {
        sendPic(sendList.pop());
    }
};

setInterval(checkRss, confData.interval * 60 * 1000);

setInterval(checkSendList, confData.bot.interval * 1000);
