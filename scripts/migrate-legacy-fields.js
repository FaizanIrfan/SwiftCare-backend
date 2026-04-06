const mongoose = require('mongoose');
const Patient = require('../models/patient');
const Review = require('../models/review');

async function run() {
  const mongoUri = String(process.env.MONGO_URI || '').trim();
  if (!mongoUri) {
    console.error('MONGO_URI is required to run legacy field migration');
    process.exit(1);
  }

  await mongoose.connect(mongoUri, {
    dbName: 'PerfectData'
  });

  const patientResult = await Patient.collection.updateMany(
    { avatar: { $exists: true } },
    [
      {
        $set: {
          image: {
            $cond: [
              {
                $or: [
                  { $eq: ['$image', null] },
                  { $eq: ['$image', ''] },
                  { $not: ['$image'] }
                ]
              },
              '$avatar',
              '$image'
            ]
          }
        }
      },
      { $unset: 'avatar' }
    ]
  );

  const reviewResult = await Review.collection.updateMany(
    { review: { $exists: true } },
    [
      {
        $set: {
          comment: {
            $cond: [
              {
                $or: [
                  { $eq: ['$comment', null] },
                  { $eq: ['$comment', ''] },
                  { $not: ['$comment'] }
                ]
              },
              '$review',
              '$comment'
            ]
          }
        }
      },
      { $unset: 'review' }
    ]
  );

  console.log('Patient image migration matched:', patientResult.matchedCount, 'modified:', patientResult.modifiedCount);
  console.log('Review comment migration matched:', reviewResult.matchedCount, 'modified:', reviewResult.modifiedCount);
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error('Legacy field migration failed:', error);
  process.exit(1);
});
