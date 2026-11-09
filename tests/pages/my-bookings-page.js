class MyBookingsPage {
  constructor(page) {
    this.page = page;
    this.cancelButton = page.getByRole('button', {name: 'Cancel booking'});
    this.contactWirni = page.getByRole('link', {name: 'Contact Wirni'});
    this.statusPill = page.locator('.status-pill');
  }

  async openWithToken(token) { await this.page.goto(`/my-bookings.html#booking=${token}`); }

  async openLatest() {
    await this.page.goto('/my-bookings.html');
    await this.page.getByRole('link', {name: 'Open my latest booking'}).click();
  }

  async cancel() { await this.cancelButton.click(); }

  async horizontalOverflow() {
    return this.page.evaluate(() => [...document.querySelectorAll('body *')]
      .map((element) => ({
        element: `${element.tagName.toLowerCase()}.${element.className}`,
        right: Math.round(element.getBoundingClientRect().right),
        width: Math.round(element.getBoundingClientRect().width),
      }))
      .filter((item) => item.right > innerWidth + 1));
  }
}

module.exports = {MyBookingsPage};
