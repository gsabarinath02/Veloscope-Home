import fs from "node:fs/promises";
import path from "node:path";

const dataRoot = process.env.DEMO_DATA_DIR
  ? path.resolve(process.env.DEMO_DATA_DIR)
  : path.join(process.cwd(), "server", "data");
const ticketFile = path.join(dataRoot, "tickets", "tickets.json");

async function ensureTicketStore() {
  await fs.mkdir(path.dirname(ticketFile), { recursive: true });
  try {
    await fs.access(ticketFile);
  } catch {
    await fs.writeFile(ticketFile, "[]\n", "utf8");
  }
}

export async function createTicket({ question, reason }) {
  await ensureTicketStore();

  const tickets = JSON.parse(await fs.readFile(ticketFile, "utf8"));
  const now = new Date();
  const random = Math.floor(10000 + Math.random() * 89999);
  const ticket = {
    id: `EVT-${now.getFullYear()}-${random}`,
    question,
    reason,
    status: "open",
    createdAt: now.toISOString()
  };

  tickets.push(ticket);
  await fs.writeFile(ticketFile, `${JSON.stringify(tickets, null, 2)}\n`, "utf8");
  return ticket;
}
