import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";

import Sequelize from "sequelize";
import fetch from 'node-fetch';

import { JSDOM } from "jsdom";

import AtcFeeds from "../../models/AtcFeeds.mjs";
import AtcNotifications from "../../models/AtcNotifications.mjs";


export const data = new SlashCommandBuilder()
  .setName("atcnotify")
  .setDescription(
    "AtCoderのRating更新情報をお知らせするよ～"
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("add")
      .setDescription("実行したテキストチャンネルに通知設定を追加するよ～")
      .addStringOption(option =>
        option
          .setName('userid')
          .setDescription('ユーザーの ID を指定してね')
          .setRequired(true)
        )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("list").setDescription("すべての設定を確認するよ～")
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("delete").setDescription("設定を削除するよ～")
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand == "add") {
    await interaction.deferReply();
    
    const userId = interaction.options.getString('userid');
    
    const AtcNoficationCount = await AtcNotifications.count({
      where: {
        guildId: interaction.guildId,
        userId: userId,
        textChannelId: interaction.channelId,
      },
    });
    if (AtcNoficationCount > 0) {
      await interaction.editReply({content: "そのユーザーはすでに登録されています。",});
      return;
    }
    const algourl = `https://atcoder.jp/users/${userId}?contestType=algo`,heuristicurl = `https://atcoder.jp/users/${userId}?contestType=heuristic`;
    const algohtml=await fetch(algourl).then(res=>res.text()),heuristichtml=await fetch(heuristicurl).then(res=>res.text());
    if (algohtml.includes('404 Not Found') || heuristichtml.includes('404 Not Found')) {
      await interaction.editReply({content: "ユーザーが見つかりませんでした。",});
      return;
    }
    const algodoc = new JSDOM(algohtml).window.document,heuristicdoc = new JSDOM(heuristichtml).window.document;

    const algotable=algodoc.querySelector('table.dl-table.mt-2'),heuristictable=heuristicdoc.querySelector('table.dl-table.mt-2');
    const algoLatestRating = algotable!=null?algotable.querySelectorAll('span')[0].textContent:'-1',heuristicLatestRating = heuristictable!=null?heuristictable.querySelectorAll('span')[0].textContent:'-1';
    const AlgorithmLatestUpdateDate = algotable!=null?algotable.querySelectorAll('td')[4].textContent:'2000/01/01',HeuristicLatestUpdateDate = heuristictable!=null?heuristictable.querySelectorAll('td')[4].textContent:'2000/01/01';

    const AtcFeed = AtcFeeds.create({
      userId: userId,
      AlgorithmLatestUpdateDate: AlgorithmLatestUpdateDate,
      AlgorithmLatestRating: algoLatestRating,
      HueristicLatestUpdateDate: HeuristicLatestUpdateDate,
      HueristicLatestRating: heuristicLatestRating,
    });

    const AtcNofications = AtcNotifications.create({
      guildId: interaction.guildId,
      userId: userId,
      textChannelId: interaction.channelId,
    });

    await Promise.all([AtcFeed, AtcNofications]);

    const embed = new EmbedBuilder()
      .setColor(0x5cb85c)
      .setTitle(`<#${interaction.channelId}> に AtCoder ユーザー通知を設定しました！`)
      .setDescription(`${userId}\nhttps://atcoder.jp/users/${userId}`);

    await interaction.editReply({
      content: "",
      embeds: [embed],
    });
  }else if (subcommand == "list") {
    const notificationusers = await AtcNotifications.findAll({
      where: {
        guildId: interaction.guildId,
      },
      attributes: [
        [Sequelize.fn('DISTINCT', Sequelize.col('textChannelId')) ,'textChannelId'],
      ]
    });
    
    if (notificationusers.length == 0) {
      await interaction.reply("設定は見つかりませんでした。");
      return;
    }

    const embeds = await Promise.all(
      notificationusers.map(async n => {
        const atcNofications = await AtcNotifications.findAll({
          where: {
            guildId: interaction.guildId,
            textChannelId: n.textChannelId,
          },
        });
        const usersArr = atcNofications.map(n => `「${n.userId}」 https://atcoder.jp/users/${n.userId}`);
        const users = usersArr.join("\n");

        return new EmbedBuilder()
            .setColor(0x0099ff)
          .setTitle(`<#${n.textChannelId}> に通知を送信する AtCoder ユーザー`)
          .setDescription(users);
      })
    );

    await interaction.reply({
      content: "",
      embeds: embeds,
    });
  } else if (subcommand == "delete") {
    const notifications = await AtcNotifications.findAll({
      where: {
        textChannelId: interaction.channelId,
      },
    });
    
    const notificationSelectMenuOptions = notifications
      .filter(n => n.userId && n.userId.trim().length >= 2)
      .map(n => {
        const label = n.userId.trim();
        return new StringSelectMenuOptionBuilder()
          .setLabel(label)
          .setDescription(`https://atcoder.jp/users/${label}`)
          .setValue(label);
      });
    
    const select = new StringSelectMenuBuilder()
            .setCustomId('AtCoder-delete')
            .setPlaceholder('削除する通知設定')
            .addOptions(notificationSelectMenuOptions)
            .setMinValues(1)
            .setMaxValues(notificationSelectMenuOptions.length);
    
        const row = new ActionRowBuilder()
            .addComponents(select);
    
    const response = await interaction.reply({
            content: '削除する通知設定を選択してください。',
            components: [row],
        });

    const collectorFilter = (i) => i.customId === "AtCoder-delete" && i.user.id === interaction.user.id;

    const collector = response.createMessageComponentCollector({
      collectorFilter,
      time: 30000,
    });

    collector.on("collect", async (collectedInteraction) => {
      const notificationsArr = await Promise.all(
        collectedInteraction.values.map(async (userId) => {
          const atcNofication = await AtcNotifications.findOne({
            where: {
              userId: userId,
              textChannelId: interaction.channelId,
            },
          });
          await atcNofication.destroy();
          return atcNofication.userId;
        })
      );

      const channels = notificationsArr.join("\n");

      const embed = new EmbedBuilder()
        .setColor(0x5cb85c)
        .setTitle(`通知を削除したユーザー`)
        .setDescription(channels);

      await collectedInteraction.update({
        content: `削除完了～👍`,
        embeds: [embed],
        components: [],
      });
    });
  }
}