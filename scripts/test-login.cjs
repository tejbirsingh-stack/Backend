const path = require('path');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require(path.join(__dirname, '../packages/@noah/db/node_modules/@prisma/client'));

const prisma = new PrismaClient();

async function testLogin() {
  try {
    const email = 'debug@test.com';
    const password = 'debug123';
    
    console.log('Testing login for:', email);
    
    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true }
    });
    
    if (!user) {
      console.log('User not found');
      return;
    }
    
    console.log('User found:', user.email);
    console.log('Password hash exists:', !!user.passwordHash);
    
    const isValid = await bcrypt.compare(password, user.passwordHash);
    console.log('Password valid:', isValid);
    
    if (!isValid) {
      // Try rehashing and comparing
      const newHash = await bcrypt.hash(password, 10);
      console.log('New hash would be:', newHash);
      console.log('Current hash:', user.passwordHash);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testLogin();