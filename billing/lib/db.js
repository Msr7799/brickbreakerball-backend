const {MongoClient} = require('mongodb');
let promise;
async function db() {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB) throw new Error('MongoDB not configured');
  if (!promise) {
    const client = new MongoClient(process.env.MONGODB_URI, {maxPoolSize:5,serverSelectionTimeoutMS:6000});
    promise = client.connect().then(async c=>{
      const database=c.db(process.env.MONGODB_DB);
      await Promise.all([
        database.collection('events').createIndex({messageId:1},{unique:true}),
        database.collection('events').createIndex({receivedAt:-1}),
        database.collection('login_attempts').createIndex({expiresAt:1},{expireAfterSeconds:0})
      ]);
      return database;
    }).catch(e=>{promise=null;throw e;});
  }
  return promise;
}
module.exports={db};
