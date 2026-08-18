const authService = require("./src/services/auth-service");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function runTests() {
  console.log("==================================================");
  console.log("   TESTING JWT FORGOT PASSWORD / RESET FLOW");
  console.log("==================================================\n");

  try {
    // 1. Find or create a test user
    let user = await prisma.user.findFirst({
      where: { email: "test_reset_flow@example.com" },
    });

    if (!user) {
      let org = await prisma.organization.findFirst();
      if (!org) {
        org = await prisma.organization.create({
          data: {
            name: "Test Org",
            slug: "test-org-reset-" + Date.now(),
          },
        });
      }

      const initialHash = await authService.hashPassword("InitialPassword123!");
      user = await prisma.user.create({
        data: {
          email: "test_reset_flow@example.com",
          name: "Reset Flow Test User",
          passwordHash: initialHash,
          orgId: org.id,
          status: "active",
          emailVerified: true,
        },
      });
    }

    console.log(`✅ Test user ready: ${user.email} (${user.id})`);

    // 2. Generate reset token
    const token1 = await authService.createPasswordResetToken(user.id);
    console.log(`✅ Generated password reset token 1.`);

    // 3. Inspect & verify JWT claims
    const secret = authService.getResetJwtSecret();
    const decoded1 = jwt.verify(token1, secret);

    console.log("   Decoded JWT Claims:", {
      sub: decoded1.sub,
      purpose: decoded1.purpose,
      jti: decoded1.jti,
      iat: decoded1.iat,
      exp: decoded1.exp,
      durationHours: (decoded1.exp - decoded1.iat) / 3600,
    });

    if (decoded1.sub !== user.id) throw new Error("JWT sub claim does not match user.id!");
    if (decoded1.purpose !== "password_reset") throw new Error("JWT purpose claim is not password_reset!");
    if (!decoded1.jti) throw new Error("JWT jti claim missing!");
    if ((decoded1.exp - decoded1.iat) !== 12 * 3600) throw new Error("JWT expiry is not 12 hours!");
    console.log("✅ JWT structure and claims verified (12-hour expiry, sub, purpose, jti).");

    // 4. Validate token 1 (should be valid)
    const valid1 = await authService.validatePasswordResetToken(token1);
    if (!valid1 || valid1.user.id !== user.id) throw new Error("Token 1 validation failed!");
    console.log("✅ Token 1 validated successfully.");

    // 5. Generate token 2 -> token 1 should be revoked
    const token2 = await authService.createPasswordResetToken(user.id);
    console.log("✅ Generated password reset token 2.");

    const valid1After2 = await authService.validatePasswordResetToken(token1);
    if (valid1After2 !== null) throw new Error("Token 1 was NOT revoked when token 2 was created!");
    console.log("✅ Previous token (Token 1) successfully revoked when Token 2 was issued.");

    const valid2 = await authService.validatePasswordResetToken(token2);
    if (!valid2) throw new Error("Token 2 validation failed!");
    console.log("✅ Token 2 validated successfully.");

    // 6. Test Password Reset using Token 2
    const newPassword = "NewSecurePassword456!";
    const resetResult = await authService.resetUserPassword(token2, newPassword);
    if (!resetResult.success) throw new Error("Password reset failed!");
    console.log("✅ Password reset executed successfully.");

    // 7. Verify new password in DB
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    const isNewPasswordValid = await authService.verifyPassword(updatedUser.passwordHash, newPassword);
    if (!isNewPasswordValid) throw new Error("New password hash verification failed!");
    console.log("✅ Updated password verified in database via bcrypt comparison.");

    // 8. Verify Token 2 is now marked used and cannot be reused
    const valid2AfterUse = await authService.validatePasswordResetToken(token2);
    if (valid2AfterUse !== null) throw new Error("Token 2 was reusable after being used!");
    console.log("✅ Used token cannot be reused (single-use enforced).");

    // 9. Verify invalid/tampered token is rejected
    const tamperedToken = token2.slice(0, -4) + "abcd";
    const validTampered = await authService.validatePasswordResetToken(tamperedToken);
    if (validTampered !== null) throw new Error("Tampered token was accepted!");
    console.log("✅ Invalid/tampered JWT rejected correctly.");

    console.log("\n==================================================");
    console.log("   ALL PASWORD RESET TESTS PASSED SUCCESSFULLY! 🎉");
    console.log("==================================================\n");
  } catch (err) {
    console.error("❌ Test Failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
