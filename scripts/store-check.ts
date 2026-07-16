import { SessionStore } from "../server/src/session-store.js";

const s = new SessionStore("/home/user/my-codex-project");
const chats = s.listChats();
console.log("chats found:", chats.length);
for (const c of chats)
  console.log(JSON.stringify({ id: c.id.slice(0, 8), title: c.title.slice(0, 70), msgs: c.messageCount }));
console.log('search "keyboard":', s.listChats("keyboard").length);
console.log('search "zzz-no-match-zzz":', s.listChats("zzz-no-match-zzz").length);
