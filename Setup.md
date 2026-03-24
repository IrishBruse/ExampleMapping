Alright — here’s a **complete, start-to-finish guide** you can follow (and hand to your team) to get this working with minimal friction.

This uses:

* Amazon Web Services EC2
* SSM (no open ports)
* one reverse SSH tunnel from your laptop

---

# 🎯 What you’ll end up with

* You run your server locally (`localhost:3000`)
* Teammates run **one command**
* They open:

  ```
  http://localhost:3000
  ```
* It hits your laptop

---

# 🧱 PART 1 — Create the EC2 instance

## Step 1 — Go to EC2

* Open AWS Console
* Search → **EC2**
* Click **Launch Instance**

---

## Step 2 — Configure instance

Use these exact settings:

### Basic

* Name: `dev-tunnel`
* AMI: **Amazon Linux 2023** (or Amazon Linux 2)
* Instance type: `t3.micro`

---

### Key pair

* Create or select one (needed for SSH tunnel)

---

### Network settings

👉 IMPORTANT:

* **Auto-assign public IP: ENABLED**
* Security Group:

  * ❌ Remove all inbound rules
  * (yes, none)

---

### Storage

* Default is fine (8GB)

---

## Step 3 — Add IAM role (CRITICAL)

You must allow SSM.

### Create role:

1. Go to **IAM → Roles**
2. Click **Create role**
3. Choose:

   * AWS service
   * Use case: EC2
4. Attach policy:

   * ✅ `AmazonSSMManagedInstanceCore`
5. Name:

   ```
   EC2-SSM-Role
   ```

---

### Attach role to EC2

* Go back to EC2
* Select your instance
* Actions → Security → Modify IAM role
* Attach:

  ```
  EC2-SSM-Role
  ```

---

## Step 4 — Wait until ready

* Instance state: **Running**
* Status checks: **2/2 passed**

---

# ✅ PART 2 — Verify SSM works

On your machine:

```bash
aws ssm start-session --target INSTANCE_ID
```

👉 If you get a shell → you're good

---

### If it fails:

Install:

```bash
brew install session-manager-plugin
```

(or AWS docs for Linux/Windows)

---

# 🖥️ PART 3 — Run your local server

On your laptop:

```bash
npm run dev
```

Make sure this works:

```bash
http://localhost:3000
```

---

# 🔁 PART 4 — Create reverse tunnel (you)

Run:

```bash
ssh -i your-key.pem \
  -R 3000:localhost:3000 \
  ec2-user@EC2_PUBLIC_IP -N
```

Leave this running.

---

## ✅ What this does

* EC2 port 3000 → forwards to your laptop
* No inbound traffic needed on your network

---

# 👥 PART 5 — Teammates connect

Each teammate runs:

```bash
aws ssm start-session \
  --target INSTANCE_ID \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3000"],"localPortNumber":["3000"]}'
```

---

# 🎉 PART 6 — Use it

Teammates open:

```
http://localhost:3000
```

👉 That’s your local server

---

# ⚡ Make it easy for your team

## Give them this script

### `connect.sh`

```bash
#!/bin/bash

INSTANCE_ID="i-xxxxxxxxxxxx"

aws ssm start-session \
  --target $INSTANCE_ID \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3000"],"localPortNumber":["3000"]}'
```

---

## They run:

```bash
chmod +x connect.sh
./connect.sh
```

Done.

---

# ⚠️ Important things to know

## 1. Your laptop must stay online

If you:

* sleep laptop ❌
* close terminal ❌

→ everyone disconnects

---

## 2. No browser URL to share

This is **not a hosted app**

Each dev:

* creates their own tunnel
* uses localhost

---

## 3. CORS (if frontend runs locally)

In your backend:

```js
app.use(cors({ origin: "*" }));
```

---

## 4. Socket.IO fix

```js
io("http://localhost:3000", {
  transports: ["websocket"]
});
```

---

# 🧠 Mental model

* You: push your server → EC2 (SSH)
* Team: pull it → their laptop (SSM)

👉 EC2 = relay only

---

# 🆘 Troubleshooting

## ❌ SSM fails

* IAM role missing
* AWS CLI not configured

---

## ❌ Connection refused

* your server not running
* SSH tunnel not active

---

## ❌ WebSocket issues

* missing nginx? (not needed here)
* forgot `transports: ["websocket"]`

---

# 🔥 That’s the full setup

---

If you want next improvements, I can help you:

* remove SSH completely (pure SSM tunnel)
* support multiple ports (API + frontend)
* add a tiny CLI so your team just runs:

  ```
  dev-connect
  ```
