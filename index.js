const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = 8000;
app.use(cors());
app.use(express.json());
const jwt = require("jsonwebtoken");
const { json } = require("express");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.get("/", (req, res) => {
  res.send("Hey Doctor Portal Is Running");
});

// database connection===========================================
const dbUser = process.env.MONGO_DB_USER;
const dbPassword = process.env.MONGO_DB_PASSWORD;

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${dbUser}:${dbPassword}@cardoctor.e0xvtmm.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function dbConnection() {
  try {
    await client.connect();
    console.log("Database connected successfully");
  } catch (error) {
    console.log(error);
  }
}
dbConnection();
// database connection===========================================

// db collection===========================================

const appointmentOpctions = client
  .db("DoctorPortal")
  .collection("apointmentOpctions");

const bookingCollection = client.db("DoctorPortal").collection("booking");
const userCollection = client.db("DoctorPortal").collection("users");
const doctorsCollection = client.db("DoctorPortal").collection("doctors");
const paymentCollection = client.db("DoctorPortal").collection("payment");

// jwt token===========================================

app.get("/jwt", async (req, res) => {
  const email = req.query.email;
  const query = { email: email };
  const user = await userCollection.find(query);

  if (user) {
    const token = jwt.sign({ email }, process.env.SECRIET_JWT_TOKEN, {
      expiresIn: "8h",
    });
    return res.status(200).send({ accesToken: token });
  } else {
    res.status(401).send({ accesToken: "No token found" });
  }
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.SECRIET_JWT_TOKEN, function (err, decoded) {
    console.log(err);
    if (err) {
      return res.status(403).send({ message: "forbidden access hey this " });
    }
    req.decoded = decoded;
    next();
  });
}

const verifyAdmin = async (req, res, next) => {
  const decoded = req.decoded.email;
  // const query = { email: decoded };
  const users = await userCollection.findOne({ email: decoded });
  console.log(users);

  if (users?.role !== "admin") {
    return res.status(401).send({
      success: false,
      message: "Unauthorized access",
    });
  }
  next();
};

// jwt token===========================================

// database CRUD===========================================

app.get("/apointmentOpction", async (req, res) => {
  const date = req.query.date;
  console.log(date);

  const query = {};
  const cursor = appointmentOpctions.find(query);
  const bookingQuery = { selectedDate: date };
  const alreadyBooking = await bookingCollection.find(bookingQuery).toArray();
  const result = await cursor.toArray();

  result.forEach((item) => {
    const opctionBook = alreadyBooking.filter(
      (booking) => booking.tritment === item.name
    );
    const bookedSlots = opctionBook.map((book) => book.slot);
    const remingingSlots = item.slots.filter(
      (slot) => !bookedSlots.includes(slot)
    );
    item.slots = remingingSlots;
  });

  try {
    res.send({
      sucess: true,
      status: "success",
      data: result,
    });
  } catch (error) {
    console.log(error);
  }
});

app.get("/v2/apointmentOpction", async (req, res) => {
  const date = req.query.date;
  const opctions = await appointmentOpctions
    .aggregate([
      {
        $lookup: {
          from: "booking",
          localField: "name",
          foregnField: "tritment",
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$selectedDate", date],
                },
              },
            },
          ],
          as: "booking",
        },
      },
      {
        $project: {
          name: 1,
          slots: 1,
          booked: {
            $map: {
              input: "$booking",
              as: "book",
              in: "$$book.slot",
            },
          },
        },
      },
      {
        $project: {
          name: 1,
          slots: {
            $setDifference: ["$slots", "$booked"],
          },
        },
      },
    ])
    .toArray();
  try {
    res.send({
      sucess: true,
      status: "success",
      data: opctions,
    });
  } catch (error) {
    console.log(error);
  }
});

// booking data insert=====================================
app.post("/bookings", async (req, res) => {
  const booking = req.body;

  const query = {
    selectedDate: booking.selectedDate,
    email: booking.email,
    tritment: booking.tritment,
  };
  const alreadyBooking = await bookingCollection.find(query).toArray();

  if (alreadyBooking.length) {
    const message = `You have already booked on${booking.selectedDate}`;
    return res.send({
      sucess: false,
      message,
      status: "error",
    });
  }
  try {
    const result = await bookingCollection.insertOne(booking);
    res.send({
      sucess: true,
      data: result,
      message: "Data inserted successfully",
    });
  } catch (error) {
    res.send({
      sucess: false,
      data: [],
      message: "Data not inserted",
    });
  }
});

// get all booking data=====================================

app.get("/bookings", verifyJWT, verifyAdmin, async (req, res) => {
  const email = req.query.email;
  let query = { email: email };

  if (req.query.email) {
    query.email = req.query.email;
  }

  const bookings = await bookingCollection.find(query).toArray();
  res.send(bookings);
});

// get booking data by date=====================================

app.get("/bookings/:id", async (req, res) => {
  const id = req.params.id;
  const query = { _id: ObjectId(id) };
  const booking = await bookingCollection.findOne(query);
  res.send(booking);
});

// post user data=====================================

app.post("/users", async (req, res) => {
  const user = req.body;
  const result = userCollection.insertOne(user);

  try {
    res.send({
      sucess: true,
      data: result,
      message: "Data inserted successfully",
    });
  } catch (error) {
    res.send({
      sucess: false,
      data: [],
      message: "Data not inserted",
    });
  }
});

// get all user data=====================================
app.get("/users", async (req, res) => {
  const query = {};
  const cursor = userCollection.find(query);
  const result = await cursor.toArray();
  try {
    res.send({
      sucess: true,
      data: result,
      message: "Data found successfully",
    });
  } catch (error) {
    res.send({
      sucess: false,
      data: [],
      message: "Data not found",
    });
  }
});

// update user data=====================================

app.get("/users/admin/:email", async (req, res) => {
  const email = req.params.email;
  const query = { email };
  const user = await userCollection.findOne(query);
  res.send({ isAdmin: user?.role === "admin" });
});

app.put("/users/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const filters = { _id: ObjectId(id) };
  const options = { upsert: true };
  const updateDoc = {
    $set: {
      role: "admin",
    },
  };
  const result = await userCollection.updateOne(filters, updateDoc, options);
  res.send(result);
});

// apontment opction data insert=====================================

app.get("/appointmentspciality", async (req, res) => {
  const query = {};
  const result = await appointmentOpctions
    .find(query)
    .project({
      name: 1,
    })
    .toArray();
  res.send(result);
});

// add docotors data=====================================

app.post("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
  const doctor = req.body;
  const result = doctorsCollection.insertOne(doctor);
  res.send(result);
});

// get all docotors data=====================================

app.get("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
  const query = {};
  const cursor = doctorsCollection.find(query);
  const result = await cursor.toArray();
  try {
    res.send({
      sucess: true,
      data: result,
      message: "Data found successfully",
    });
  } catch (error) {
    res.send({
      sucess: false,
      data: [],
      message: "Data not found",
    });
  }
});

// delete docotors data=====================================

app.delete("/doctors/:id", verifyJWT, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const query = { _id: ObjectId(id) };
  const result = await doctorsCollection.deleteOne(query);
  res.send(result);
});

// add Price data=====================================

app.get("/addPrice", async (req, res) => {
  const filter = {};
  const opction = { upsert: true };
  const updateDoc = {
    $set: {
      price: 100,
    },
  };
  const result = await appointmentOpctions.updateMany(
    filter,
    updateDoc,
    opction
  );
  res.send(result);
});

// STRIPE PAYMENT===========================================

app.post("/create-payment-intent", async (req, res) => {
  const booking = req.body;
  const price = booking.price;
  const amount = price * 100;

  const paymentIntent = await stripe.paymentIntents.create({
    currency: "usd",
    amount: amount,
    payment_method_types: ["card"],
  });
  res.send({
    clientSecret: paymentIntent.client_secret,
  });
});

app.post("/payment", async (req, res) => {
  const payment = req.body;
  const id = payment.bookingId;
  const filter = { _id: ObjectId(id) };
  const opction = { upsert: true };
  const updateDoc = {
    $set: {
      paid: true,
      transationId: payment.transationId,
      status: "paid",
    },
  };
  const updatedResult = await bookingCollection.updateOne(
    filter,
    updateDoc,
    opction
  );
  const result = await paymentCollection.insertOne(payment);
  res.send(result);
});

app.get("/payment", async (req, res) => {
  const query = {};
  const cursor = paymentCollection.find(query);
  const result = await cursor.toArray();
  try {
    res.send({
      sucess: true,
      data: result,
      message: "Data found successfully",
    });
  } catch (error) {
    res.send({
      sucess: false,
      data: [],
      message: "Data not found",
    });
  }
});

// STRIPE PAYMENT===========================================

// database CRUD===========================================

app.listen(port, () => {
  console.log(`Doctor portal is runnig on ${port}`);
});
