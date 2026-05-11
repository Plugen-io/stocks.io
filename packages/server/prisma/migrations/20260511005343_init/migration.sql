-- CreateTable
CREATE TABLE `Device` (
    `id` VARCHAR(191) NOT NULL,
    `cpuFingerprint` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `enrolledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NULL,

    INDEX `Device_cpuFingerprint_idx`(`cpuFingerprint`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Certificate` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `serialNumber` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `pemCert` TEXT NOT NULL,
    `csrPem` TEXT NOT NULL,
    `caVersion` INTEGER NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedReason` VARCHAR(191) NULL,
    `supersededAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',

    UNIQUE INDEX `Certificate_serialNumber_key`(`serialNumber`),
    INDEX `Certificate_deviceId_status_idx`(`deviceId`, `status`),
    INDEX `Certificate_status_expiresAt_idx`(`status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EnrollmentToken` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `usedAt` DATETIME(3) NULL,
    `usedByDeviceId` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdByAdminId` VARCHAR(191) NULL,

    UNIQUE INDEX `EnrollmentToken_token_key`(`token`),
    INDEX `EnrollmentToken_token_used_idx`(`token`, `used`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Inflow` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `certificateId` VARCHAR(191) NOT NULL,
    `amountBRL` DECIMAL(12, 2) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `success` BOOLEAN NOT NULL,
    `errorCode` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Inflow_idempotencyKey_key`(`idempotencyKey`),
    INDEX `Inflow_deviceId_createdAt_idx`(`deviceId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Heartbeat` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `certificateId` VARCHAR(191) NOT NULL,
    `ts` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `latencyMs` INTEGER NULL,
    `ip` VARCHAR(191) NULL,
    `agentVersion` VARCHAR(191) NULL,
    `uptimeSec` INTEGER NULL,

    INDEX `Heartbeat_deviceId_ts_idx`(`deviceId`, `ts`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServerCA` (
    `id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `pemCert` TEXT NOT NULL,
    `pemKey` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `retiredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `crossSignedByVersion` INTEGER NULL,
    `crossSignedPem` TEXT NULL,

    UNIQUE INDEX `ServerCA_version_key`(`version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Certificate` ADD CONSTRAINT `Certificate_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inflow` ADD CONSTRAINT `Inflow_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inflow` ADD CONSTRAINT `Inflow_certificateId_fkey` FOREIGN KEY (`certificateId`) REFERENCES `Certificate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Heartbeat` ADD CONSTRAINT `Heartbeat_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `Device`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Heartbeat` ADD CONSTRAINT `Heartbeat_certificateId_fkey` FOREIGN KEY (`certificateId`) REFERENCES `Certificate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
