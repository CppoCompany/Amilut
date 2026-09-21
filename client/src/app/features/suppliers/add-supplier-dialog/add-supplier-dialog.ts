import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { finalize } from 'rxjs';

import { SuppliersApi } from '../../../api/suppliers-api';
import type { CreateSupplierDto, SupplierDto } from '../../../api/models';

const SAVE_FAILED_MESSAGE = 'שמירת הספק נכשלה, נסה שוב';

/**
 * Modal popup for creating a new supplier. Emits `saved` with the created
 * supplier, or `cancelled` when closed via the button, Escape or the backdrop.
 */
@Component({
  selector: 'app-add-supplier-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './add-supplier-dialog.html',
  styleUrl: './add-supplier-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onCancel()',
  },
})
export class AddSupplierDialog implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(SuppliersApi);
  private readonly destroyRef = inject(DestroyRef);

  /** Name typed in the search box, used to prefill the form. */
  readonly initialName = input('');

  /** Emitted with the newly created supplier once the server confirms it. */
  readonly saved = output<SupplierDto>();

  /** Emitted when the user closes the popup without saving. */
  readonly cancelled = output<void>();

  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required, Validators.maxLength(255)]),
    address: this.fb.control('', [Validators.maxLength(500)]),
    phone: this.fb.control('', [Validators.maxLength(50)]),
    email: this.fb.control('', [Validators.email, Validators.maxLength(255)]),
  });

  /** Set once a submit has been attempted, so errors show even on untouched fields. */
  protected readonly submitted = signal(false);

  /** True while the supplier is being created on the server. */
  protected readonly saving = signal(false);

  /** Hebrew server error to show under the form, or `null`. */
  protected readonly error = signal<string | null>(null);

  constructor() {
    afterNextRender(() => this.nameInput().nativeElement.focus());
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.error.set(null));
  }

  ngOnInit(): void {
    this.form.controls.name.setValue(this.initialName().trim());
  }

  protected get name(): AbstractControl {
    return this.form.controls.name;
  }

  protected get address(): AbstractControl {
    return this.form.controls.address;
  }

  protected get phone(): AbstractControl {
    return this.form.controls.phone;
  }

  protected get email(): AbstractControl {
    return this.form.controls.email;
  }

  /** Whether to surface validation errors for a control yet. */
  protected showError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || this.submitted());
  }

  protected onSubmit(): void {
    if (this.saving()) return;
    this.error.set(null);
    // Trim before validating so a whitespace-only name is rejected as required.
    this.form.controls.name.setValue(this.form.controls.name.value.trim());

    if (this.form.invalid) {
      this.submitted.set(true);
      this.form.markAllAsTouched();
      return;
    }

    const { name, address, phone, email } = this.form.getRawValue();
    const dto: CreateSupplierDto = {
      name,
      address: address.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    };

    this.saving.set(true);
    this.api
      .create(dto)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (supplier) => this.saved.emit(supplier),
        error: () => this.error.set(SAVE_FAILED_MESSAGE),
      });
  }

  protected onCancel(): void {
    if (this.saving()) return;
    this.cancelled.emit();
  }

  /** Only clicks on the backdrop itself (not inside the card) cancel. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }
}
