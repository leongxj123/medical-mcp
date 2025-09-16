# 🔒 Medical MCP Server - Security Configuration

## Localhost-Only Binding

The Medical MCP Server is configured to run in **localhost-only mode** for maximum security when handling sensitive medical data.

## 🚨 Security Features

### **1. Localhost-Only Binding**

- **HTTP Mode**: Binds to `127.0.0.1` only (localhost)
- **Stdio Mode**: Inherently localhost-only (process communication)
- **IP Filtering**: Blocks all non-localhost connection attempts
- **CORS Restrictions**: Only allows localhost origins

### **2. Connection Validation**

```typescript
// Security checks for incoming connections
const isLocalhost =
  clientIP === "127.0.0.1" ||
  clientIP === "::1" ||
  clientIP === "::ffff:127.0.0.1" ||
  req.headers.host?.startsWith("localhost:") ||
  req.headers.host?.startsWith("127.0.0.1:");
```

### **3. Access Control**

- **Blocked**: All external IP addresses
- **Allowed**: Only localhost (127.0.0.1, ::1)
- **Logging**: All blocked attempts are logged
- **Response**: 403 Forbidden for non-localhost requests

## 🚀 Usage Modes

### **Stdio Mode (Default - Most Secure)**

```bash
# Default stdio transport (inherently localhost-only)
npm start
# or
node build/index.js
```

**Security**: ✅ **Maximum Security**

- Process-to-process communication only
- No network exposure
- Cannot be accessed remotely

### **HTTP Mode (Localhost-Only)**

```bash
# HTTP server on localhost only
npm run start:http
# or
node build/index.js --http

# Custom port (default: 3000)
npm run start:http:port
# or
node build/index.js --http --port=8080
```

**Security**: ✅ **High Security**

- Binds to 127.0.0.1 only
- IP address validation
- CORS restrictions to localhost
- External connections blocked

## 🔍 Security Verification

### **Test Localhost Access**

```bash
# Should work (localhost)
curl http://localhost:3000/message

# Should be blocked (external IP)
curl http://YOUR_EXTERNAL_IP:3000/message
# Returns: "Access denied: This server is restricted to localhost only"
```

### **Check Binding**

```bash
# Verify server is bound to localhost only
netstat -an | grep :3000
# Should show: 127.0.0.1:3000 (not 0.0.0.0:3000)
```

## ⚠️ Security Warnings

### **NEVER Run on External Interfaces**

```bash
# ❌ DANGEROUS - Don't do this
node build/index.js --http --host=0.0.0.0

# ✅ SECURE - Always use localhost
node build/index.js --http
```

### **Firewall Configuration**

- The server is designed to be localhost-only
- No additional firewall rules needed
- External access is impossible by design

### **Medical Data Protection**

- All medical data queries are logged
- No data is stored locally
- All information is retrieved dynamically
- Sensitive medical information stays on localhost

## 🛡️ Additional Security Measures

### **1. Process Isolation**

- Runs in isolated process
- No shared memory with other applications
- Clean shutdown on SIGINT

### **2. Error Handling**

- No sensitive data in error messages
- Detailed logging for security events
- Graceful failure modes

### **3. Resource Limits**

- No persistent data storage
- Memory usage is minimal
- Automatic cleanup on shutdown

## 📋 Security Checklist

- [x] **Localhost-only binding** (127.0.0.1)
- [x] **IP address validation**
- [x] **CORS restrictions**
- [x] **External connection blocking**
- [x] **Security logging**
- [x] **No external network exposure**
- [x] **Process isolation**
- [x] **Clean shutdown handling**

## 🔧 Configuration

### **Environment Variables**

```bash
# Optional: Set custom port
export MCP_PORT=8080
node build/index.js --http --port=$MCP_PORT
```

### **Command Line Options**

```bash
# Stdio mode (default)
node build/index.js

# HTTP mode on localhost
node build/index.js --http

# HTTP mode with custom port
node build/index.js --http --port=8080
```

## 🚨 Emergency Shutdown

```bash
# Graceful shutdown
Ctrl+C

# Force shutdown
kill -9 <process_id>
```

---

**⚠️ IMPORTANT**: This server is designed for localhost-only use. Never configure it to accept external connections as it handles sensitive medical data.
