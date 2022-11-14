import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import Joi from "joi";
import dotenv from "dotenv";
import dayjs from "dayjs";

// configs
const app = express();
app.use(express.json());
app.use(cors());
dotenv.config();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient.connect().then(() => {
  db = mongoClient.db("batepapo_uol_database");
});

const userSchema = Joi.object({
  name: Joi.string().required(),
});

const messageSchema = Joi.object({
  to: Joi.string().required(),
  text: Joi.string().required(),
  type: Joi.string().required().valid("private_message", "message"),
});

app.post("/participants", async (req, res) => {
  const { name } = req.body;
  const validation = userSchema.validate({ name });
  const { error } = validation;
  if (error) {
    return res.sendStatus(422);
  }

  try {
    const user = await db.collection("participants").findOne({ name });

    if (user) {
      return res.sendStatus(409);
    }

    await db
      .collection("participants")
      .insertOne({ name, lastStatus: Date.now() });

    const arrivalMessage = {
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
    };

    await db.collection("posts").insertOne(arrivalMessage);

    res.sendStatus(201);
  } catch (err) {
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participants = await db.collection("participants").find().toArray();
    res.send(participants);
  } catch {
    res.sendStatus(500);
  }
});

app.post("/messages", async (req, res) => {
  const { user } = req.headers;
  const { to, text, type } = req.body;

  const userValidation = userSchema.validate({ name: user });

  if (userValidation.error) {
    return res.sendStatus(422);
  }

  const messageValidation = messageSchema.validate({ to, text, type });

  if (messageValidation.error) {
    return res.sendStatus(422);
  }

  try {
    const participantStatus = await db
      .collection("participants")
      .findOne({ name: user });

    if (!participantStatus) {
      return res.sendStatus(422);
    }

    const formattedMessage = {
      from: user,
      to,
      text,
      type,
      time: dayjs().format("HH:mm:ss"),
    };

    await db.collection("posts").insertOne(formattedMessage);
    res.sendStatus(201);
  } catch (err) {
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  const { limit } = req.query;
  const { user } = req.headers;

  const userValidation = userSchema.validate({ name: user });

  if (userValidation.error) {
    return res.sendStatus(422);
  }

  try {
    const posts = await db.collection("posts").find().toArray();
    const filteredPosts = posts.filter(
      (obj) => obj.to === "Todos" || obj.to === user || obj.from === user
    );

    if (limit) {
      const latestFilteredPosts = filteredPosts.reverse();
      res.send(latestFilteredPosts.slice(0, parseInt(limit)).reverse());
    } else {
      res.send(filteredPosts);
    }
  } catch (err) {
    res.sendStatus(500);
  }
});

app.post("/status", async (req, res) => {
  const { user } = req.headers;
  const userValidation = userSchema.validate({ name: user });

  if (userValidation.error) {
    return res.sendStatus(422);
  }

  try {
    const participant = await db
      .collection("participants")
      .findOne({ name: user });
    console.log(participant);
    if (!participant) {
      return res.sendStatus(404);
    }
    const id = participant._id;
    await db
      .collection("participants")
      .updateOne(
        { _id: id },
        { $set: { ...participant, lastStatus: Date.now() } }
      );
    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(500);
  }
});

async function expellInactiveParticipants() {
  let timeNow = Date.now();

  try {
    const participants = await db.collection("participants").find().toArray();

    participants.forEach(async (participant) => {
      const id = participant._id;
      const lastStatus = participant.lastStatus;
      const name = participant.name;
      const seconds = (timeNow - lastStatus) / 1000;

      if (seconds > 10) {
        await db.collection("participants").deleteOne({ _id: id });

        const formattedMessage = {
          from: name,
          to: "Todos",
          text: "sai da sala...",
          type: "status",
          time: dayjs().format("HH:mm:ss"),
        };

        await db.collection("posts").insertOne(formattedMessage);
      }
    });
  } catch (err) {
    res.sendStatus(500);
  }
}

setInterval(expellInactiveParticipants, 15000);

app.delete("/messages/:message_id", async (req, res) => {
  const { user } = req.headers;
  const { message_id } = req.params;
  try {
    const message = await db
      .collection("posts")
      .findOne({ _id: ObjectId(message_id) });
    console.log(message);

    if (!message) {
      return res.sendStatus(404);
    }
    if (message.from !== user) {
      return res.sendStatus(401);
    }

    await db.collection("posts").deleteOne({ _id: ObjectId(message_id) });
  } catch (err) {
    res.sendStatus(500);
  }
});

app.put("/messages/:message_id", async (req, res) => {
  const { user } = req.headers;
  const { to, text, type } = req.body;
  const { message_id } = req.params;

  const userValidation = userSchema.validate({ name: user });

  if (userValidation.error) {
    return res.sendStatus(422);
  }

  const messageValidation = messageSchema.validate({ to, text, type });

  if (messageValidation.error) {
    return res.sendStatus(422);
  }

  try {
    const message = await db
      .collection("posts")
      .findOne({ _id: ObjectId(message_id) });

    if (!message) {
      return res.sendStatus(404);
    }

    if (message.from !== user) {
      return res.sendStatus(401);
    }
    const test = await db
      .collection("posts")
      .updateOne(
        { _id: ObjectId(message_id) },
        { $set: { ...message, to, text, type } }
      );
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.listen(5000, () => {
  console.log("Server running in port 5000");
});

