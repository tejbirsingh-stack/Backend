const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../packages/@noah/db/node_modules/@prisma/client'));

const prisma = new PrismaClient();

async function checkUser() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'debug@test.com' },
      include: { organization: true }
    });
    
    console.log('User found:', user ? 'Yes' : 'No');
    if (user) {
      console.log('Email:', user.email);
      console.log('Name:', user.name);
      console.log('Role:', user.role);
      console.log('Status:', user.status);
      console.log('Has password:', user.passwordHash ? 'Yes' : 'No');
      console.log('Password hash length:', user.passwordHash ? user.passwordHash.length : 0);
      console.log('Organization:', user.organization?.name);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUser();