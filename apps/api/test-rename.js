const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const session = await prisma.userSession.findFirst({ select: { token: true, userId: true } });
  console.log('Session token:', session ? 'Found' : 'Not found');
  
  if (session) {
    const user = await prisma.user.findFirst({ where: { id: session.userId }, select: { id: true, email: true } });
    console.log('User:', user);
    
    // Find an asset owned by this user or just any asset
    const asset = await prisma.asset.findFirst({ select: { id: true, title: true } });
    console.log('Asset:', asset);

    const res = await fetch(`http://localhost:3002/api/media/${asset.id}/rename`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`
      },
      body: JSON.stringify({ title: asset.title + ' (renamed)' })
    });
    console.log('Response status:', res.status);
    console.log('Response body:', await res.text());
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
