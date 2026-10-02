-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- AlterTable
ALTER TABLE "Itinerary" ADD COLUMN     "hotelLat" DOUBLE PRECISION,
ADD COLUMN     "hotelLng" DOUBLE PRECISION,
ADD COLUMN     "hotelName" TEXT,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'day',
ADD COLUMN     "numDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ItineraryItem" ADD COLUMN     "dayIndex" INTEGER NOT NULL DEFAULT 1;

