import mongoose from "mongoose";

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  mongoose.connection.on("connected", () => {
    console.log("MongoDB connected");
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err);
  });

  mongoose.connection.on("disconnected", () => {
    console.log("MongoDB disconnected");
  });

  await mongoose.connect(uri);
  await reconcileEmailIndexes();
}

/**
 * The `emails` collection used to carry a plain unique index on
 * { gmailAccountId, messageId }. Outbound drafts have no messageId, so under the
 * old index a second draft on the same account collides on null. Mongoose will
 * not replace an index whose options changed, so drop the stale one and let it
 * be rebuilt as the partial index declared on the schema.
 */
async function reconcileEmailIndexes(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;

  try {
    const collections = await db.listCollections({ name: "emails" }).toArray();
    if (collections.length === 0) return;

    const indexes = await db.collection("emails").indexes();
    const stale = indexes.find(
      (index) =>
        index.name === "gmailAccountId_1_messageId_1" &&
        index.unique === true &&
        !index.partialFilterExpression
    );
    if (!stale) return;

    await db.collection("emails").dropIndex("gmailAccountId_1_messageId_1");
    console.log("Dropped stale unique index emails.gmailAccountId_1_messageId_1");
  } catch (err) {
    console.error("Failed to reconcile email indexes:", err);
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
