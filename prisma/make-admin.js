import 'dotenv/config';
import { PrismaClient } from '../src/lib/prisma/client.ts';

const prisma = new PrismaClient();

const email = process.argv[2] || 'admin@cyberghost.com';

async function main() {
    const result = await prisma.user.updateMany({
        where: { email },
        data: { role: 'ADMIN' },
    });

    if (result.count === 0) {
        console.log(`No user found with email: ${email}`);
    } else {
        console.log(`✅ User "${email}" is now ADMIN`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
