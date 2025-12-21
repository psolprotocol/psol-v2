import { PrismaClient } from '@prisma/client';
import { generateSessionCode } from '@streampump/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // Create demo user
  const demoUser = await prisma.user.upsert({
    where: { twitchId: 'demo_streamer' },
    update: {},
    create: {
      twitchId: 'demo_streamer',
      displayName: 'Demo Streamer',
      email: 'demo@streampump.dev',
      profileImageUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/0a-profile_image-300x300.png',
    },
  });

  console.log(`✅ Created demo user: ${demoUser.displayName}`);

  // Create streamer profile
  const profile = await prisma.streamerProfile.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      streamerWalletPubkey: 'DemoWallet111111111111111111111111111111111',
      platformFeeBps: 100, // 1%
    },
  });

  console.log(`✅ Created streamer profile with wallet: ${profile.streamerWalletPubkey}`);

  // Create demo images (placeholders)
  const imageUrls = [
    'https://placehold.co/256x256/FF5733/white?text=DOGE',
    'https://placehold.co/256x256/33FF57/white?text=PEPE',
    'https://placehold.co/256x256/3357FF/white?text=MOON',
    'https://placehold.co/256x256/FF33F5/white?text=CHAD',
  ];

  const images = await Promise.all(
    imageUrls.map(async (url, index) => {
      return prisma.imageAsset.create({
        data: {
          url,
          sha256: `demo_image_${index}_${Date.now()}`,
          mime: 'image/png',
          width: 256,
          height: 256,
        },
      });
    })
  );

  console.log(`✅ Created ${images.length} demo images`);

  // Create demo session
  const sessionCode = generateSessionCode();
  const session = await prisma.session.create({
    data: {
      code: sessionCode,
      title: 'Demo Token Launch - Pick the Winner!',
      status: 'DRAFT',
      durationSeconds: 300, // 5 minutes
      createdById: demoUser.id,
      options: {
        create: {
          options: [
            { index: 0, name: 'DogeCoin Moon', ticker: 'DOGE', imageId: images[0].id },
            { index: 1, name: 'Pepe Token', ticker: 'PEPE', imageId: images[1].id },
            { index: 2, name: 'To The Moon', ticker: 'MOON', imageId: images[2].id },
            { index: 3, name: 'Chad Coin', ticker: 'CHAD', imageId: images[3].id },
          ],
        },
      },
      feeSplits: {
        createMany: {
          data: [
            { walletPubkey: profile.streamerWalletPubkey, bps: 500, role: 'STREAMER' }, // 5%
          ],
        },
      },
      images: {
        connect: images.map(img => ({ id: img.id })),
      },
    },
  });

  console.log(`✅ Created demo session: ${session.title}`);
  console.log(`   Session code: ${sessionCode}`);
  console.log(`   Status: ${session.status}`);

  // Create a second session in VOTING state for testing
  const votingSessionCode = generateSessionCode();
  const votingSession = await prisma.session.create({
    data: {
      code: votingSessionCode,
      title: 'Active Voting Session - Vote Now!',
      status: 'VOTING',
      durationSeconds: 600, // 10 minutes
      startedAt: new Date(),
      createdById: demoUser.id,
      options: {
        create: {
          options: [
            { index: 0, name: 'Super Doge', ticker: 'SDOGE', imageId: images[0].id },
            { index: 1, name: 'Ultra Pepe', ticker: 'UPEPE', imageId: images[1].id },
          ],
        },
      },
      feeSplits: {
        createMany: {
          data: [
            { walletPubkey: profile.streamerWalletPubkey, bps: 300, role: 'STREAMER' }, // 3%
          ],
        },
      },
    },
  });

  console.log(`\n✅ Created voting session: ${votingSession.title}`);
  console.log(`   Session code: ${votingSessionCode}`);
  console.log(`   Status: ${votingSession.status}`);

  console.log('\n🎉 Seeding completed!\n');
  console.log('Quick start:');
  console.log(`  - Dashboard: http://localhost:3000/dashboard`);
  console.log(`  - Vote page: http://localhost:3000/vote/${votingSessionCode}`);
  console.log(`  - Overlay: http://localhost:3000/overlay/${votingSessionCode}`);
  console.log(`  - Control room: http://localhost:3000/dashboard/sessions/${session.id}`);
  console.log('');
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
