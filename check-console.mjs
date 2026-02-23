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
    consoleMessages.push({ type, text });
    console.log(`[${type.toUpperCase()}] ${text}`);
  });
  
  page.on('pageerror', error => {
    errors.push(error.message);
    console.log(`[PAGE ERROR] ${error.message}`);
  });
  
  page.on('requestfailed', request => {
    const failure = `${request.url()} - ${request.failure().errorText}`;
    failedRequests.push(failure);
    console.log(`[REQUEST FAILED] ${failure}`);
  });
  
  try {
    console.log('Navigating to http://localhost:5173/...');
    await page.goto('http://localhost:5173/', { 
      waitUntil: 'networkidle2',
      timeout: 10000 
    });
    
    // Wait a bit more for any async errors
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Take screenshot
    await page.screenshot({ path: '/tmp/screenshot.png', fullPage: true });
    console.log('\nScreenshot saved to /tmp/screenshot.png');
    
    console.log('\n=== Summary ===');
    console.log(`Total console messages: ${consoleMessages.length}`);
    console.log(`Total page errors: ${errors.length}`);
    console.log(`Total failed requests: ${failedRequests.length}`);
    
    if (errors.length > 0) {
      console.log('\n=== All Errors ===');
      errors.forEach((err, i) => console.log(`${i + 1}. ${err}`));
    }
    
    if (failedRequests.length > 0) {
      console.log('\n=== All Failed Requests ===');
      failedRequests.forEach((req, i) => console.log(`${i + 1}. ${req}`));
    }
    
  } catch (e) {
    console.error('Navigation error:', e.message);
  }
  
  await browser.close();
})();
