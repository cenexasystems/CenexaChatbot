const fs = require('fs');

fs.copyFileSync(
  'src/app/api/conversations/[id]/verify-payment/route.ts',
  'Whatsapp-Agent/src/app/api/conversations/[id]/verify-payment/route.ts'
);

fs.copyFileSync(
  'src/app/page.tsx',
  'Whatsapp-Agent/src/app/page.tsx'
);

console.log('Files copied successfully.');
