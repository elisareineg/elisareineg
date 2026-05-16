import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const user = process.env.GITHUB_USER || process.env.GITHUB_REPOSITORY_OWNER;

if (!token) {
  throw new Error("GITHUB_TOKEN is required");
}

if (!user) {
  throw new Error("GITHUB_USER or GITHUB_REPOSITORY_OWNER is required");
}

const to = new Date();
const from = new Date(to);
from.setFullYear(from.getFullYear() - 1);

const query = `
  query Contributions($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      name
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
              weekday
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    query,
    variables: {
      login: user,
      from: from.toISOString(),
      to: to.toISOString(),
    },
  }),
});

const payload = await response.json();

if (!response.ok || payload.errors) {
  throw new Error(JSON.stringify(payload.errors || payload, null, 2));
}

const calendar = payload.data.user.contributionsCollection.contributionCalendar;
const total = calendar.totalContributions;
const weeks = calendar.weeks;
const days = weeks.flatMap((week) => week.contributionDays);
const activeDays = days.filter((day) => day.contributionCount > 0).length;
const maxDay = days.reduce((best, day) =>
  day.contributionCount > best.contributionCount ? day : best
);
const maxWeek = Math.max(
  ...weeks.map((week) =>
    week.contributionDays.reduce((sum, day) => sum + day.contributionCount, 0)
  )
);

const monthLabels = [];
let lastMonth = "";
weeks.forEach((week, weekIndex) => {
  const firstDay = week.contributionDays[0];
  if (!firstDay) return;
  const month = new Date(`${firstDay.date}T00:00:00Z`).toLocaleString("en", {
    month: "short",
    timeZone: "UTC",
  });
  if (month !== lastMonth) {
    monthLabels.push({ month, weekIndex });
    lastMonth = month;
  }
});

const palette = ["#242424", "#0b5f35", "#169b55", "#1db954", "#a7f3b4"];
const levelFor = (count) => {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
};

const square = 8;
const gap = 3;
const gridX = 410;
const gridY = 154;
const cardWidth = 1080;
const cardHeight = 460;
const grid = weeks
  .flatMap((week, weekIndex) =>
    week.contributionDays.map((day) => {
      const x = gridX + weekIndex * (square + gap);
      const y = gridY + day.weekday * (square + gap);
      const fill = palette[levelFor(day.contributionCount)];
      return `<rect x="${x}" y="${y}" width="${square}" height="${square}" rx="2" fill="${fill}"><title>${day.date}: ${day.contributionCount} contributions</title></rect>`;
    })
  )
  .join("\n");

const labels = monthLabels
  .filter((label) => label.weekIndex % 2 === 0)
  .map(
    ({ month, weekIndex }) =>
      `<text x="${gridX + weekIndex * (square + gap)}" y="132" class="month">${month}</text>`
  )
  .join("\n");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${user}'s GitHub Wrapped contribution graph</title>
  <desc id="desc">${total} GitHub contributions over the last year, shown as a Spotify Wrapped-style contribution grid.</desc>
  <style>
    .eyebrow { fill: #1db954; font: 700 16px Arial, sans-serif; letter-spacing: 2px; text-transform: uppercase; }
    .title { fill: #ffffff; font: 900 48px Arial, sans-serif; }
    .label { fill: #b3b3b3; font: 700 15px Arial, sans-serif; }
    .number { fill: #ffffff; font: 900 72px Arial, sans-serif; }
    .small-number { fill: #ffffff; font: 900 28px Arial, sans-serif; }
    .month { fill: #8d8d8d; font: 700 10px Arial, sans-serif; }
    .chip { fill: #191919; stroke: #2f2f2f; stroke-width: 1; }
  </style>
  <rect width="${cardWidth}" height="${cardHeight}" rx="28" fill="#121212"/>
  <path d="M0 342 C164 272 254 424 424 352 C588 282 640 120 824 172 C924 200 988 132 1080 82 V460 H0 Z" fill="#1DB954" opacity="0.18"/>
  <path d="M760 0 H1080 V232 C1016 214 974 166 902 164 C812 160 774 210 688 194 C622 182 570 138 502 148 C424 158 370 228 300 244 C196 268 84 202 0 238 V0 H760 Z" fill="#1DB954" opacity="0.08"/>

  <text x="48" y="70" class="eyebrow">GitHub Wrapped</text>
  <text x="48" y="126" class="title">Contribution</text>
  <text x="48" y="176" class="title">Mix</text>
  <text x="50" y="226" class="label">Total contributions</text>
  <text x="48" y="296" class="number">${total.toLocaleString("en-US")}</text>

  <rect x="48" y="334" width="118" height="74" rx="12" class="chip"/>
  <text x="64" y="366" class="small-number">${activeDays}</text>
  <text x="64" y="392" class="label">active days</text>

  <rect x="184" y="334" width="118" height="74" rx="12" class="chip"/>
  <text x="200" y="366" class="small-number">${maxWeek}</text>
  <text x="200" y="392" class="label">top week</text>

  <text x="${gridX}" y="98" class="label">Last 12 months</text>
  <text x="${gridX}" y="120" class="eyebrow">Square contribution graph</text>
  ${labels}
  ${grid}

  <rect x="${gridX}" y="280" width="232" height="52" rx="12" class="chip"/>
  <text x="${gridX + 18}" y="312" class="label">Best day: ${maxDay.contributionCount} contributions</text>
  <text x="822" y="312" class="label">Less</text>
  ${palette
    .map(
      (color, index) =>
        `<rect x="${860 + index * 18}" y="302" width="10" height="10" rx="2" fill="${color}"/>`
    )
    .join("\n  ")}
  <text x="964" y="312" class="label">More</text>
</svg>
`;

await mkdir("dist", { recursive: true });
await writeFile("dist/contribution-wrapped.svg", svg);
