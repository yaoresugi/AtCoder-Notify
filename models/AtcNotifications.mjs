import { Sequelize, DataTypes } from "sequelize";

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: ".data/db.sqlite3",
});

const AtcNotifications = sequelize.define("AtcNotifications", {
  guildId: {
    type: DataTypes.STRING,
  },
  userId:{
    type: DataTypes.STRING,
  },
  textChannelId: {
    type: DataTypes.STRING,
  },
});

export default AtcNotifications;