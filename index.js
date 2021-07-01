const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongodb = require("mongodb");
var dateFormat = require("dateformat");

const app = express();
app.use(express.json());
app.use(cors());
dotenv.config();

const port = process.env.PORT || 3001;
const mongoClient = mongodb.MongoClient;
const objectId = mongodb.ObjectID;
const DB_URL = process.env.DBURL || "mongodb://127.0.0.1:27017";

function convertObj(periodicTask, today) {
  const rand = Math.random().toString(36).substring(5).toUpperCase();
  const data = {
    taskId:
      periodicTask.creationdate + "_" + periodicTask.tasktype.type + "_" + rand,
    heading: periodicTask.heading,
    creationdate: periodicTask.creationdate,
    executiondate: today,
    notes: periodicTask.notes,
    status: periodicTask.status,
    tasktype: {
      type: periodicTask.tasktype.type,
      weekday: periodicTask.tasktype.weekday,
      dateofmonth: periodicTask.tasktype.dateofmonth,
      dateofyear: periodicTask.tasktype.dateofyear,
    },
  };

  return { ...data };
}

var today = new Date(2016, 05, 25);

setInterval(async () => {
  var todaysDate, todaysName, todaysDay, todaysMonth, todaysTasks;
  todaysDay = dateFormat(today, "dd");
  if (todaysDay !== dateFormat(new Date(), "dd")) {
    today = new Date();
    todaysDate = dateFormat(today, "mm/dd/yyyy");
    todaysName = dateFormat(today, "dddd");
    todaysDay = dateFormat(today, "dd");
    todaysMonth = dateFormat(today, "mm");
    todaysTasks = [];

    try {
      const client = await mongoClient.connect(DB_URL);
      const db = client.db("TasksDB");

      const periodicTasks = await db
        .collection("tasks")
        .find({
          "tasktype.type": { $in: ["EVERYDAY", "WEEKLY", "MONTHLY", "YEARLY"] },
        })
        .project({ _id: 0 })
        .toArray();

      for (const periodicTask of periodicTasks) {
        if (periodicTask.tasktype.type === "EVERYDAY") {
          todaysTasks.push(convertObj(periodicTask, todaysDate));
        } else if (periodicTask.tasktype.type === "WEEKLY") {
          if (todaysName.toUpperCase() === periodicTask.tasktype.weekday) {
            todaysTasks.push(convertObj(periodicTask, todaysDate));
          }
        } else if (periodicTask.tasktype.type === "MONTHLY") {
          if (todaysDay === periodicTask.tasktype.dateofmonth) {
            todaysTasks.push(convertObj(periodicTask, todaysDate));
          }
        } else if (periodicTask.tasktype.type === "YEARLY") {
          if (
            todaysMonth + "/" + todaysDay ===
            periodicTask.tasktype.dateofyear
          ) {
            todaysTasks.push(convertObj(periodicTask, todaysDate));
          }
        } else {
        }
      }
      const insertResult = await db.collection("tasks").insertMany(todaysTasks);
    } catch (err) {
      console.log(err);
    }
  }
}, 60 * 60 * 1000);

function getTense(givenDate) {
  var givenDateParts = givenDate.split("/");
  var todaysDate = dateFormat(new Date(), "mm/dd/yyyy");
  var todaysDateParts = todaysDate.split("/");

  if (givenDateParts[2] > todaysDateParts[2]) {
    return "FUTUREDAY";
  } else if (givenDateParts[2] === todaysDateParts[2]) {
    if (parseInt(givenDateParts[0]) > parseInt(todaysDateParts[0])) {
      return "FUTUREDAY";
    } else if (parseInt(givenDateParts[0]) === parseInt(todaysDateParts[0])) {
      if (parseInt(givenDateParts[1]) > parseInt(todaysDateParts[1])) {
        return "FUTUREDAY";
      } else if (parseInt(givenDateParts[1]) === parseInt(todaysDateParts[1])) {
        return "PRESENTDAY";
      } else {
        return "PASTDAY";
      }
    } else {
      return "PASTDAY";
    }
  } else {
    return "PASTDAY";
  }
}

app.post("/createtask", async (req, res) => {
  try {
    const client = await mongoClient.connect(DB_URL);
    const db = client.db("TasksDB");

    const rand = Math.random().toString(36).substring(5).toUpperCase();
    const data = {
      taskId: req.body.creationdate + "_" + req.body.tasktype + "_" + rand,
      heading: req.body.heading,
      creationdate: req.body.creationdate,
      executiondate: req.body.executiondate,
      notes: req.body.notes,
      status: req.body.status,
      tasktype: {
        type: req.body.tasktype,
        weekday: req.body.weekday,
        dateofmonth: req.body.dateofmonth,
        dateofyear: req.body.dateofyear,
      },
    };

    const result = await db.collection("tasks").insertOne(data);
    res.send({
      status: "success",
    });
    client.close();
  } catch (err) {
    res.send({
      status: "failed",
    });
    client.close();
  }
});

app.post("/gettasks", async (req, res) => {
  if (getTense(req.body.executiondate) === "FUTUREDAY") {
    var futureTasks = [];
    const requestedDate = req.body.executiondate;
    const requestedDateName = dateFormat(requestedDate, "dddd");
    const requestedDateDay = dateFormat(requestedDate, "dd");
    const requestedDateMonth = dateFormat(requestedDate, "mm");

    try {
      const client = await mongoClient.connect(DB_URL);
      const db = client.db("TasksDB");

      const generalTasks = await db
        .collection("tasks")
        .find({
          executiondate: req.body.executiondate,
        })
        .project({ _id: 0 })
        .toArray();

      futureTasks.push(...generalTasks);

      const periodicTasks = await db
        .collection("tasks")
        .find({
          $and: [
            {
              "tasktype.type": {
                $in: ["EVERYDAY", "WEEKLY", "MONTHLY", "YEARLY"],
              },
            },
            { executiondate: "none" },
          ],
        })
        .project({ _id: 0 })
        .toArray();

      for (const periodicTask of periodicTasks) {
        if (periodicTask.tasktype.type === "EVERYDAY") {
          futureTasks.push(periodicTask);
        } else if (periodicTask.tasktype.type === "WEEKLY") {
          if (
            requestedDateName.toUpperCase() === periodicTask.tasktype.weekday
          ) {
            futureTasks.push(periodicTask);
          }
        } else if (periodicTask.tasktype.type === "MONTHLY") {
          if (requestedDateDay === periodicTask.tasktype.dateofmonth) {
            futureTasks.push(periodicTask);
          }
        } else if (periodicTask.tasktype.type === "YEARLY") {
          if (
            requestedDateMonth + "/" + requestedDateDay ===
            periodicTask.tasktype.dateofyear
          ) {
            futureTasks.push(periodicTask);
          }
        } else {
        }
      }

      res.send({
        status: "success",
        result: futureTasks,
      });
      client.close();
    } catch (err) {
      console.log(err);
      res.send({
        status: "failed",
      });
      client.close();
    }
  } else {
    try {
      const client = await mongoClient.connect(DB_URL);
      const db = client.db("TasksDB");
      const generalTasks = await db
        .collection("tasks")
        .find({
          executiondate: req.body.executiondate,
        })
        .project({ _id: 0 })
        .toArray();
      res.send({
        status: "success",
        result: generalTasks,
      });
      client.close();
    } catch (err) {
      res.send({
        status: "failed",
      });
      client.close();
    }
  }
});

app.post("/getperiodictasks", async (req, res) => {
  try {
    const client = await mongoClient.connect(DB_URL);
    const db = client.db("TasksDB");

    const periodicTasks = await db
      .collection("tasks")
      .find({ "tasktype.type": req.body.tasktype, executiondate: "none" })
      .project({ _id: 0 })
      .toArray();

    res.send({
      status: "success",
      result: periodicTasks,
    });
    client.close();
  } catch (err) {
    res.send({
      status: "failed",
    });
    client.close();
  }
});

app.post("/updatetask", async (req, res) => {
  try {
    const client = await mongoClient.connect(DB_URL);
    const db = client.db("TasksDB");

    const result = await db
      .collection("tasks")
      .update(
        { taskId: req.body.taskId },
        { $set: { status: req.body.status } }
      );
    res.send({
      status: "success",
    });
    client.close();
  } catch (err) {
    res.send({
      status: "failed",
    });
    client.close();
  }
});

app.listen(port, () => {
  console.log(`::::  Server started and running on port ${port} ::::`);
});
