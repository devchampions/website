const fetch = require('node-fetch');
const moment = require('moment');

async function fetchLatest() {
    const unique = Math.ceil(Math.random() * 10);
    const response = await fetch('https://devternity.com/js/event.js?=' + unique);
    const json = await response.json();
    return json;
};


async function events() {

    const [ latestDevTernity ] = (await fetchLatest())
    const { schedule } = latestDevTernity.program.find(it => it.event == "workshops")

    return schedule.map(it => ({
        title: it.title,
        date: moment(latestDevTernity.date_iso).add(1, 'days').format("D MMM YYYY"),
        description: it.brief_description,
        link: {
            name: "More info at DevTernity.com",
            href:" https://devternity.com"
        },
        trainer: {
            name: it.name, 
            title: it.bio,
            avatar: 'https://devternity.com/' + it.img
        },
        location: "Riga, Latvia"
    }))
}

module.exports.events = events
