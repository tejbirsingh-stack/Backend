import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const users = await prisma.user.findMany({ where: { id: { in: ['b0b58f4d-0f1c-4e07-97c9-1b5fcf6b9be8', '963df1b1-adef-4dd2-a5b8-25acbe9a85bd'] } } });
  console.log(users.map(u => ({ id: u.id, name: u.name, email: u.email })));
  await prisma.$disconnect();
}
run();
