const simpleGit = require("simple-git");
const git = simpleGit();
const { Module } = require("../main");
const renderDeploy = require("./utils/render-api");
const config = require("../config");
const fs = require("fs").promises;
const axios = require("axios");

const handler = config.HANDLERS !== "false" ? config.HANDLERS.split("")[0] : ".";
const localPackageJson = require("../package.json");

async function isGitRepo() {
  try {
    await fs.access(".git");
    return true;
  } catch (e) {
    return false;
  }
}

async function getRemoteVersion() {
  try {
    // Points directly to your own GitHub repository
    const remotePackageJsonUrl = `https://raw.githubusercontent.com/JITHUKNR/OGGY-MD/main/package.json`;
    const response = await axios.get(remotePackageJsonUrl);
    return response.data.version;
  } catch (error) {
    throw new Error("Failed to fetch remote version");
  }
}

Module(
  {
    pattern: "update ?(.*)",
    fromMe: true,
    desc: "Checks for and applies OGGY-MD bot updates.",
    use: "owner",
  },
  async (message, match) => {
    if (!(await isGitRepo())) {
      return await message.sendReply(
        "_⚠️ This bot isn't running from a Git repository. Automatic updates aren't available._"
      );
    }

    const command = match[1] ? match[1].toLowerCase() : "";
    const processingMsg = await message.sendReply("_⚡ Checking for OGGY-MD updates..._");

    try {
      await git.fetch();
      const commits = await git.log(["main..origin/main"]);
      const localVersion = localPackageJson.version;
      let remoteVersion;

      try {
        remoteVersion = await getRemoteVersion();
      } catch (error) {
        return await message.edit(
          "_❌ Failed to fetch remote version. Please check your GitHub repository._",
          message.jid,
          processingMsg.key
        );
      }

      const hasCommits = commits.total > 0;
      const versionChanged = remoteVersion !== localVersion;

      if (!hasCommits && !versionChanged) {
        return await message.edit(
          "╭───〔 ⚡ *OGGY-MD SYSTEM* 〕───\n│ ✅ *OGGY-MD is already up to date!*\n│ 📦 *Current Version:* v" + localVersion + "\n╰────────────────────────",
          message.jid,
          processingMsg.key
        );
      }

      const isBetaUpdate = hasCommits && !versionChanged;
      const isStableUpdate = hasCommits && versionChanged;

      if (!command) {
        let updateInfo = "";

        if (isStableUpdate) {
          updateInfo = `╭━━━〔 ⚡ *OGGY-MD UPDATE* ⚡ 〕━━━╮\n`;
          updateInfo += `┃ 📦 *Current:* v${localVersion}\n`;
          updateInfo += `┃ 🚀 *Latest:* v${remoteVersion}\n`;
          updateInfo += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`;
          updateInfo += `*📝 CHANGELOG:*\n`;
          for (let i in commits.all) {
            updateInfo += `◦ ${parseInt(i) + 1}. ${commits.all[i].message}\n`;
          }
          updateInfo += `\n_👉 Use \`${handler}update start\` to apply this update._`;
        } else if (isBetaUpdate) {
          updateInfo = `╭━━━〔 ⚡ *OGGY-MD BETA UPDATE* 〕━━━╮\n`;
          updateInfo += `┃ 📦 *Version:* v${localVersion}\n`;
          updateInfo += `┃ 🔄 *New Commits:* ${commits.total}\n`;
          updateInfo += `╰━━━━━━━━━━━━━━━━━━━━╯\n\n`;
          updateInfo += `*📝 RECENT COMMITS:*\n`;
          for (let i in commits.all) {
            updateInfo += `◦ ${parseInt(i) + 1}. ${commits.all[i].message}\n`;
          }
          updateInfo += `\n_👉 Use \`${handler}update beta\` to apply these commits._`;
        }

        return await message.edit(updateInfo, message.jid, processingMsg.key);
      }

      if (command === "start") {
        if (!isStableUpdate) {
          if (isBetaUpdate) {
            return await message.edit(
              `_Only beta commits available. Use \`${handler}update beta\` to apply them._`,
              message.jid,
              processingMsg.key
            );
          }
          return await message.edit(
            "_No stable updates available!_",
            message.jid,
            processingMsg.key
          );
        }

        await message.edit(
          "_🚀 Starting OGGY-MD update... Please wait!_",
          message.jid,
          processingMsg.key
        );

        if (process.env.RENDER_SERVICE_ID) {
          if (!config.RENDER_API_KEY) {
            return await message.edit(
              "_Missing RENDER_API_KEY!_",
              message.jid,
              processingMsg.key
            );
          }

          await renderDeploy(
            process.env.RENDER_SERVICE_ID,
            config.RENDER_API_KEY
          );
          return await message.edit(
            "_Render deploy started for OGGY-MD!_",
            message.jid,
            processingMsg.key
          );
        }

        if (!__dirname.startsWith("/rgnk")) {
          await git.reset("hard", ["HEAD"]);
          await git.pull();
          await message.edit(
            `_✅ OGGY-MD updated successfully to v${remoteVersion}! Bot is restarting..._`,
            message.jid,
            processingMsg.key
          );
          process.exit(0);
        } else {
          return await message.edit(
            "_Please visit your hosting platform to deploy update._",
            message.jid,
            processingMsg.key
          );
        }
      } else if (command === "beta") {
        if (!hasCommits) {
          return await message.edit(
            "_No new commits available!_",
            message.jid,
            processingMsg.key
          );
        }

        await message.edit(
          "_🔄 Pulling recent GitHub commits for OGGY-MD..._",
          message.jid,
          processingMsg.key
        );

        if (process.env.RENDER_SERVICE_ID) {
          if (!config.RENDER_API_KEY) {
            return await message.edit(
              "_Missing RENDER_API_KEY!_",
              message.jid,
              processingMsg.key
            );
          }

          await renderDeploy(
            process.env.RENDER_SERVICE_ID,
            config.RENDER_API_KEY
          );
          return await message.edit(
            "_Render deploy started for beta update!_",
            message.jid,
            processingMsg.key
          );
        }

        if (!__dirname.startsWith("/rgnk")) {
          await git.reset("hard", ["HEAD"]);
          await git.pull();
          await message.edit(
            `_✅ OGGY-MD successfully updated with ${commits.total} commit${
              commits.total > 1 ? "s" : ""
            }! Bot is restarting..._`,
            message.jid,
            processingMsg.key
          );
          process.exit(0);
        } else {
          return await message.edit(
            "_Please visit your hosting platform to deploy update._",
            message.jid,
            processingMsg.key
          );
        }
      } else {
        return await message.edit(
          `_Invalid command. Use \`${handler}update\` to check updates, or \`${handler}update beta\` to pull recent commits._`,
          message.jid,
          processingMsg.key
        );
      }
    } catch (error) {
      console.error("Update error:", error);
      return await message.edit(
        "_An error occurred while updating OGGY-MD._",
        message.jid,
        processingMsg.key
      );
    }
  }
);
