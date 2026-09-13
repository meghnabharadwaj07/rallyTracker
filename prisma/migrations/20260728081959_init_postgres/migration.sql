-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CUSTOMER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlPoint" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "rangeMeters" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL,
    "isStart" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ControlPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Crossing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "controlPointId" TEXT NOT NULL,
    "crossedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Crossing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "ControlPoint_routeId_idx" ON "ControlPoint"("routeId");

-- CreateIndex
CREATE INDEX "Crossing_userId_routeId_idx" ON "Crossing"("userId", "routeId");

-- CreateIndex
CREATE UNIQUE INDEX "Crossing_userId_routeId_controlPointId_key" ON "Crossing"("userId", "routeId", "controlPointId");

-- AddForeignKey
ALTER TABLE "ControlPoint" ADD CONSTRAINT "ControlPoint_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crossing" ADD CONSTRAINT "Crossing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crossing" ADD CONSTRAINT "Crossing_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Crossing" ADD CONSTRAINT "Crossing_controlPointId_fkey" FOREIGN KEY ("controlPointId") REFERENCES "ControlPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
