const redis = require('redis');
const client = redis.createClient({
    url: 'redis://redis:6379' 
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