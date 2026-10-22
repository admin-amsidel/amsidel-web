import { Component, ViewEncapsulation } from '@angular/core';

/**
 * Loads the shared portal look (portal.scss) and PrimeIcons for whatever page includes it: the portal frame and the login
 * page. Unscoped on purpose, so the rules reach inside PrimeNG components; removed again when the portal closes.
 */
@Component({
  selector: 'app-portal-styles',
  template: '',
  styleUrls: ['./portal-icons.scss', './portal.scss'],
  encapsulation: ViewEncapsulation.None,
  host: { style: 'display: none' },
})
export class PortalStyles {}
