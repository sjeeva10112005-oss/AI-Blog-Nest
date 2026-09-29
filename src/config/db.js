const dns = require('dns');
const mongoose = require('mongoose');

// Node on Windows sometimes picks up 127.0.0.1 as its only DNS server, which makes
// mongodb+srv:// SRV lookups fail with ECONNREFUSED. Fall back to public resolvers.
const ensureDnsServers = () => {
  const servers = dns.getServers();
  const onlyLoopback = servers.every((s) => s.startsWith('127.') || s === '::1');
  if (onlyLoopback) {
    const fallback = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(',').map((s) => s.trim());
    dns.setServers(fallback);
  }
};

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MongoDB connection error: MONGO_URI is not defined in environment variables');
    process.exit(1);
  }

  if (mongoUri.startsWith('mongodb+srv://')) {
    ensureDnsServers();
  }

  try {
    const conn = await mongoose.connect(mongoUri);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
