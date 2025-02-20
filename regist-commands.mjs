import fs from 'fs';
import path from 'path';
import { REST, Routes } from 'discord.js';

const commands = [];
const foldersPath = path.join(process.cwd(), 'commands');
const commandFolders = fs.readdirSync(foldersPath);

export default async () => {
  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.mjs'));
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      await import(filePath).then(module => {
        commands.push(module.data.toJSON());
      });
    }
  }

  // 環境変数の確認ログ
  console.log("[DEBUG] APPLICATION_ID:", process.env.APPLICATION_ID);
  console.log("[DEBUG] TOKEN:", process.env.TOKEN ? "存在" : "未設定");

  const rest = new REST().setToken(process.env.TOKEN);

  (async () => {
    try {
      console.log(`[DEBUG] 更新前: ${commands.length}個のコマンド`);

      // グローバルコマンドの更新
      console.log("[DEBUG] グローバルコマンドを更新します...");
      const globalData = await rest.put(
        Routes.applicationCommands(process.env.APPLICATION_ID),
        { body: commands },
      );
      console.log("[DEBUG] グローバルコマンド更新完了", globalData);

      console.log(`[INIT] ${commands.length}個のスラッシュコマンドを更新しました。`);
    } catch (error) {
      console.error("[ERROR]", error);
    }
  })();
};