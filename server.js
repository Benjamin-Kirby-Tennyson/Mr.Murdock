const express = require("express");
const WebSocket = require("ws");

const app = express();
app.use(express.json());

// Simple secret key so only YOUR ESP32 can push updates
const SECRET = process.env.SECRET_KEY || "change-me";

let latest = {
  seq: 0,
  state: 0,
  min_mm: 0,
  grid: Array(64).fill(0),
  msg: "Waiting for data..."
};

const server = app.listen(process.env.PORT || 3000, () => {
  console.log("Murdock server running");
});

const wss = new WebSocket.Server({ server });

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// Dashboard connects here
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>MURDOCK – Private Dashboard</title>
  <style>
    body { font-family: Arial; margin: 20px; }
    #grid { display: grid; grid-template-columns: repeat(64, 32px); gap: 4px; }
    .cell { width: 256px; height: 256px; background: #ddd; border-radius: 6px;
            display:flex; align-items:center; justify-content:center; font-size:10px; }
    .safe { background:#9ae6b4; }
    .warn { background:#ffd93d; }
    .danger { background:#ff6b6b; }
  </style>
</head>
<body>
<h2>MURDOCK – Live Private Dashboard</h2>
<h3 id="state">STATE</h3>
<p>Min distance: <span id="dist">0</span> mm</p>
<p id="msg"></p>
<div id="grid"></div>

<script>
  const grid = document.getElementById("grid");
  const cells = [];
  for (let i=0;i<64;i++){
    const d=document.createElement("div");
    d.className="cell";
    grid.appendChild(d);
    cells.push(d);
  }

  function cls(mm){ return mm<600?"danger":mm<1200?"warn":"safe"; }

  const wsProto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(wsProto + "://" + location.host);

  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    document.getElementById("state").textContent =
      ["SAFE","WARNING","DANGER"][d.state] || "UNKNOWN";
    document.getElementById("dist").textContent = d.min_mm;
    document.getElementById("msg").textContent = d.msg || "";

    (d.grid || []).forEach((mm,i)=>{
      cells[i].className = "cell " + cls(mm||0);
      cells[i].textContent = mm ? Math.round(mm/100)*100 : "";
    });
  };
</script>
</body>
</html>
  `);
});

// ESP32 posts here (private)
app.post("/update", (req, res) => {
  const key = req.headers["x-murdock-key"];
  if (key !== SECRET) return res.status(401).json({ ok: false });

  latest = req.body;
  broadcast(latest);
  res.json({ ok: true });
});

// When a dashboard connects, send current data
wss.on("connection", (ws) => {
  ws.send(JSON.stringify(latest));
});
