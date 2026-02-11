import 'dotenv/config';
import { PrismaClient } from '../src/lib/prisma/client.ts';

const prisma = new PrismaClient();

const configId = "e11163f3-90ea-437f-99e9-709e9a637cee";

const configs = [
    {
        configId: configId,
        name: "config1",
        isp: "isp1",
        config: "config1"
    },
    {
        configId: configId,
        name: "config2",
        isp: "isp2",
        config: "config2"
    },
    {
        configId: configId,
        name: "config3",
        isp: "isp3",
        config: "config3"
    },
    {
        configId: configId,
        name: "config4",
        isp: "isp4",
        config: "config4"
    },
    {
        configId: configId,
        name: "config5",
        isp: "isp5",
        config: "config5"
    }
];

const main = async () => {
    console.log("seeding database...");
    for (const cfg of configs) {
        await prisma.configs.create({
            data: cfg
        });
        console.log("created config", cfg.name);
    }
};

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });