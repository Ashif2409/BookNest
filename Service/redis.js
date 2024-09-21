const redis = require('redis');
const client = redis.createClient({
    url: process.env.REDIS_URL 
});

client.on('connect', () => {
    console.log('Connected to Redis');
});

client.on('error', (err) => {
    console.error('Redis connection error:', err);
});

const connectToRedis=async () => {
    try {
        await client.connect();
    } catch (err) {
        console.error('Could not connect to Redis:', err);
    }
}

module.exports = {connectToRedis,client};