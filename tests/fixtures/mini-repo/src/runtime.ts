import http from "node:http";
import fs from "node:fs";

http
  .createServer((_req, res) => {
    res.end("ok");
  })
  .listen(3000);

setInterval(() => {
  fs.writeFileSync("out.txt", "hello");
}, 1000);
