const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function seedDatabase() {
    try {
        console.log("🌱 Seeding database...");

        // ===========================
        // Hash Password
        // ===========================

        const hashedPassword = await bcrypt.hash("Noah@2026!", 10);

        // ===========================
        // Create Organization
        // ===========================

        const org = await prisma.organization.upsert({
            where: { slug: "demo-org" },
            update: {},
            create: {
                name: "Demo Organization",
                slug: "demo-org",
                planType: "professional",
                features: {},
                metadata: {},
            },
        });

        console.log("✅ Organization created");


        // ===========================
        // Seed Roles
        // ===========================

        const roles = [
            {
                name: "System Admin",
                show: 0,
            },
            {
                name: "Admin",
                show: 1,
            },
            {
                name: "Editor",
                show: 1,
            },
            {
                name: "Super Admin",
                show: 0,
            },
            {
                name: "Viewer",
                show: 1,
            },
            {
                name: "Collaborator",
                show: 1,
            },
        ];

        const roleMap = {};

        for (const role of roles) {
            const createdRole = await prisma.role.upsert({
                where: {
                    name: role.name,
                },
                update: {},
                create: role,
            });

            roleMap[role.name] = createdRole;

            console.log(`✅ Role created: ${createdRole.name}`);
        }


        // ===========================
        // Create System Admin User
        // ===========================

        await prisma.user.upsert({
            where: {
                email: "systemadminnoah@yopmail.com",
            },
            update: {},
            create: {
                name: "System Admin",
                email: "systemadminnoah@yopmail.com",
                roleId: roleMap["System Admin"].id,
                orgId: org.id,
                status: "active",
                passwordHash: hashedPassword,
                emailVerified: true,
                preferences: {},
            },
        });

        console.log("✅ System Admin created");


        // ===========================
        // Create Super Admin User
        // ===========================

        await prisma.user.upsert({
            where: {
                email: "tejbir.singh@mtxeurope.com",
            },
            update: {},
            create: {
                name: "Super Admin",
                email: "tejbir.singh@mtxeurope.com",
                roleId: roleMap["Super Admin"].id,
                orgId: org.id,
                status: "active",
                passwordHash: hashedPassword,
                emailVerified: true,
                preferences: {},
            },
        });

        console.log("✅ Super Admin created");


        console.log("🎉 Database seeded successfully");

    } catch (err) {
        console.error("❌ Seeding failed:", err);
    } finally {
        await prisma.$disconnect();
    }
}

seedDatabase();