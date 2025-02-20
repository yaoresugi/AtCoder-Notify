import fs from "fs";
import path from "path";
import express from "express";
import { Client, Collection, GatewayIntentBits, ActivityType, EmbedBuilder } from "discord.js";
import CommandsRegister from "./regist-commands.mjs";
import AtcNotifications from "./models/AtcNotifications.mjs";
import AtcFeeds from "./models/AtcFeeds.mjs";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import Sequelize from "sequelize";

if (process.env.RUN_APP === "true") {
  const app = express();

  app.listen(3000, () => {
    console.log("Express server listening on port 3000");
  });

  app.post("/", (req, res) => {
    console.log("Received POST request.");
    trigger();
    res.send("POST response by glitch");
  });

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.DirectMessages,
    ],
  });

  client.commands = new Collection();

  const categoryFoldersPath = path.join(process.cwd(), "commands");
  const commandFolders = fs.readdirSync(categoryFoldersPath);

  for (const folder of commandFolders) {
    const commandsPath = path.join(categoryFoldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".mjs"));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      import(filePath).then((module) => {
        client.commands.set(module.data.name, module);
      });
    }
  }

  const handlers = new Map();
  const handlersPath = path.join(process.cwd(), "handlers");
  const handlerFiles = fs.readdirSync(handlersPath).filter((file) => file.endsWith(".mjs"));
  
  for (const file of handlerFiles) {
    const filePath = path.join(handlersPath, file);
    import(filePath).then((module) => {
      handlers.set(file.slice(0, -4), module.default);
    });
  }
  
  client.on("interactionCreate", async (interaction) => {
    await handlers.get("interactionCreate")?.default(interaction);
  });

  client.on("ready", async () => {
    await client.user.setActivity("🥔", { type: ActivityType.Custom, state: "精進中" });
    console.log(`${client.user.tag} がログインしました！`);
  });

  AtcFeeds.sync();
  AtcNotifications.sync();

  CommandsRegister();
  client.login(process.env.TOKEN);

  async function trigger() {
    const AtcNofications = await AtcNotifications.findAll({
      attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("userId")), "userId"]],
    });
    await Promise.all(
      AtcNofications.map(async (n) => {
        checkFeed(n.userId);
      })
    );
  }

  async function checkFeed(userId) {
    const atcFeed = await AtcFeeds.findOne({
      where: { userId: userId },
    });

    let AlgorithmLatestUpdateDate = new Date(atcFeed.AlgorithmLatestUpdateDate),
      HueristicLatestUpdateDate = new Date(atcFeed.HueristicLatestUpdateDate);
    let AlgorithmLatestRating = Number(atcFeed.AlgorithmLatestRating),
      HueristicLatestRating = Number(atcFeed.HueristicLatestRating);
    const AlgorithmPreRating = AlgorithmLatestRating,
      HueristicPreRating = HueristicLatestRating;
    const AlgorithmPreUpdateDate = AlgorithmLatestUpdateDate,
      HueristicPreUpdateDate = HueristicLatestUpdateDate;

    const url = `https://atcoder.jp/users/${userId}/history`;
    const Algorithmhtml = await fetch(url + `?contestType=algo`).then((res) => res.text()),
      Hueristichtml = await fetch(url + `?contestType=heuristic`).then((res) => res.text());
    if(Algorithmhtml.includes('404 Not Found') || Hueristichtml.includes('404 Not Found')) {
      await AtcFeeds.destroy({
        where: { userId: userId }
      });
      await AtcNotifications.destroy({
        where: { userId: userId }
      });
      return;
    }
    const Algorithmdoc = new JSDOM(Algorithmhtml).window.document,
      Hueristicdoc = new JSDOM(Hueristichtml).window.document;

    for (let i = 0; i < 2; i++) {
      const table = i === 0 ? Algorithmdoc.querySelectorAll("tr") : Hueristicdoc.querySelectorAll("tr");
      const lastRow = table[table.length - 1];
      if (!lastRow) continue;
      const spanElements = lastRow.querySelectorAll("span");
      if (!spanElements[2] || spanElements[2].textContent.trim() === "") continue;
      const latestRating = Number(spanElements[2].textContent);
      const timeElements = lastRow.querySelectorAll("time");
      if (!timeElements || timeElements.length === 0) continue;
      const latestUpdateDate = new Date(timeElements[0].textContent);

      if (i === 0) {
        if (latestUpdateDate > AlgorithmLatestUpdateDate) {
          AlgorithmLatestUpdateDate = latestUpdateDate;
          AlgorithmLatestRating = latestRating;
        }
      } else {
        if (latestUpdateDate > HueristicLatestUpdateDate) {
          HueristicLatestUpdateDate = latestUpdateDate;
          HueristicLatestRating = latestRating;
        }
      }
    }

    const notifications = await AtcNotifications.findAll({
      where: { userId: userId },
    });

    if (AlgorithmLatestUpdateDate > AlgorithmPreUpdateDate) {
      const embed = new EmbedBuilder()
        .setColor(0x5cb85c)
        .setTitle(`AtCoder ユーザー ${userId} のレートが更新されました！`)
        .setDescription(
          `Algorithm: ${AlgorithmPreRating} -> ${AlgorithmLatestRating}\nhttps://atcoder.jp/users/${userId}`
        );
      notifications.forEach((n) => {
        const channel = client.channels.cache.get(n.textChannelId);
        if (channel) {
          channel.send({ embeds: [embed] });
        } else {
          console.warn(`Channel not found for textChannelId: ${n.textChannelId}`);
        }
      });
    }

    if (HueristicLatestUpdateDate > HueristicPreUpdateDate) {
      const embed = new EmbedBuilder()
        .setColor(0x5cb85c)
        .setTitle(`AtCoder ユーザー ${userId} のレートが更新されました！`)
        .setDescription(
          `Hueristic: ${HueristicPreRating} -> ${HueristicLatestRating}\nhttps://atcoder.jp/users/${userId}`
        );
      notifications.forEach((n) => {
        const channel = client.channels.cache.get(n.textChannelId);
        if (channel) {
          channel.send({ embeds: [embed] });
        } else {
          console.warn(`Channel not found for textChannelId: ${n.textChannelId}`);
        }
      });
    }

    await AtcFeeds.update(
      {
        AlgorithmLatestUpdateDate: AlgorithmLatestUpdateDate.toISOString(),
        AlgorithmLatestRating: AlgorithmLatestRating,
        HueristicLatestUpdateDate: HueristicLatestUpdateDate.toISOString(),
        HueristicLatestRating: HueristicLatestRating,
      },
      { where: { userId: userId } }
    );
  }
} else {
  console.log("アプリケーションは停止中です。RUN_APP を 'true' に設定して起動してください。");
}
