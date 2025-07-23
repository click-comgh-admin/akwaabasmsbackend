const bcrypt = require('bcrypt');
bcrypt.hash('CLOCK@FACIAL', 10, (err, hash) => {
  if (err) {
    console.error('Error generating hash:', err);
  } else {
    console.log('Generated hash:', hash);
  }
});