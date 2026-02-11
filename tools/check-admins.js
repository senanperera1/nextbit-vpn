import 'dotenv/config';
import { PrismaClient } from '../src/lib/prisma/client.ts';

const prisma = new PrismaClient();

async function main() {
    const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { email: true, name: true, role: true }
    });
    console.log('Admins found:', JSON.stringify(admins, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
