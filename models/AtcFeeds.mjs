import { Sequelize, DataTypes } from "sequelize";

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: ".data/db.sqlite3",
});

const AtcFeeds = sequelize.define("AtcFeeds", {
  userId: {
    type: DataTypes.STRING,
  },
  AlgorithmLatestUpdateDate: {
    type: DataTypes.STRING,
  },
  AlgorithmLatestRating: {
    type: DataTypes.STRING,
  },
  HueristicLatestUpdateDate: {
    type: DataTypes.STRING,
  },
  HueristicLatestRating: {
    type: DataTypes.STRING,
  },
});

export default AtcFeeds;