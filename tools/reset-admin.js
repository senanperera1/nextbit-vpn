import 'dotenv/config';
import { PrismaClient } from '../src/lib/prisma/client.ts';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const email = 'admin@cyberghost.com';
const newPassword = 'admin123';

async function main() {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await prisma.user.updateMany({
        where: { email },
        data: { password: hashedPassword },
    });

    if (result.count === 0) {
        console.log(`No user found with email: ${email}`);
    } else {
        console.log(`✅ Password for "${email}" reset to "${newPassword}"`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
