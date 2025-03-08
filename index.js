import dayjs from 'dayjs'
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { setTimeout } from 'timers/promises';
import { JSDOM } from 'jsdom';
import { performance } from 'perf_hooks';

const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
const loopLimitMs = 1000 * 60 * 30; // 30 min

if (!slackWebhookUrl) {
  throw "Please set SLACK_WEBHOOK_URL";
}

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Tokyo");

const getCalenderUrls = (months = 3) => {
  const now = dayjs();
  return [...Array(months + 1)].map((_, i) => i).map((i) => {
    const date = i === 0 ? now : now.add(i, "month");

    return `https://sp.mdj.jp/Adventure/Calendar/s/?str_code=13993&event_ym=${date.format('YYYYMM')}`
  });
}

(async () => {
  const start = performance.now();
  while(true) {
    const lap = performance.now();
    if ((lap - start) > loopLimitMs) {
      console.log(`process ${loopLimitMs} ms`);
      break
    }

    const urls = getCalenderUrls();

    const responses = await Promise.all(urls.map(async (url) => {
      const res = await fetch(url, {
        method: "GET",
      });
      if (!res.ok) {
        return Promise.resolve("");
      }
      return res.text();
    }));

    let dates;
    let errBody;
    try {
      dates = responses.filter(v => v.trim() !== "" && !v.match('エラーが発生しました')).flatMap((res) => {
        errBody = res;
        const dom = new JSDOM(res);
        const month = dom.window.document.querySelector('.month').textContent;
        const books = Array.from(dom.window.document.querySelectorAll('.book')).filter((v) => {
          const src = v.querySelector('img').src;
          const reservable = !!src.match('icon-reservable\.png$');
          const limited = !!src.match('adv_000_triangle\.png$');

          return reservable || limited;
        });

        return books.map((book) => {
          const day = book.closest('td').querySelector('.day').textContent.trim();
          return `${month}${day}日`;
        });
      });
    } catch {
      console.log(errBody);
      throw 'unexpected html'
    }

    if (dates.length !== 0) {
      await fetch(slackWebhookUrl, {
        method: "GET",
        body: {
          text: `<https://sp.mdj.jp/Adventure/Schedule/s/?str_code=13993|見つかりました>
          ${dates.map((v) => `- ${v}`)}`,
        },
      });
    } else {
      console.log("not found sheets.");
    }

    await setTimeout(5000);
  }
})();
