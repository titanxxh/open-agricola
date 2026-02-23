import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  const consoleMessages = [];
  const errors = [];
  const failedRequests = [];
  
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    const args = msg.args();
    consoleMessages.push({ type, text, args: args.map(a => a.toString()) });
  });
  
  page.on('pageerror', error => {
    errors.push(error.toString());
  });
  
  page.on('requestfailed', request => {
    failedRequests.push(`${request.url()} - ${request.failure().errorText}`);
  });
  
  try {
    await page.goto('http://localhost:5173/', { 
      waitUntil: 'networkidle2',
      timeout: 10000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await page.screenshot({ path: '/tmp/screenshot-detailed.png', fullPage: true });
    
    console.log('\n=== CONSOLE MESSAGES ===');
    consoleMessages.forEach((msg, i) => {
      console.log(`\n[${i + 1}] Type: ${msg.type.toUpperCase()}`);
      console.log(`Text: ${msg.text}`);
    });
    
    console.log('\n\n=== PAGE ERRORS ===');
    errors.forEach((err, i) => {
      console.log(`\n[${i + 1}] ${err}`);
    });
    
    console.log('\n\n=== FAILED REQUESTS ===');
    if (failedRequests.length === 0) {
      console.log('None');
    } else {
      failedRequests.forEach((req, i) => {
        console.log(`\n[${i + 1}] ${req}`);
      });
    }
    
    console.log('\n\n=== SUMMARY ===');
    console.log(`Total console messages: ${consoleMessages.length}`);
    console.log(`Total page errors: ${errors.length}`);
    console.log(`Total failed requests: ${failedRequests.length}`);
    
  } catch (e) {
    console.error('Navigation error:', e.message);
  }
  
  await browser.close();
})();
