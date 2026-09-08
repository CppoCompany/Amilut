import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    email: this.fb.control('', [Validators.required, Validators.email]),
    password: this.fb.control('', [Validators.required]),
  });

  /** Set once a submit has been attempted, so errors show even on untouched fields. */
  protected readonly submitted = signal(false);

  /** True after a successful (mock) submit; cleared when the user edits the form. */
  protected readonly signedIn = signal(false);

  constructor() {
    // Clear the mock acknowledgement as soon as the user changes anything.
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.signedIn.set(false));
  }

  protected get email(): AbstractControl {
    return this.form.controls.email;
  }

  protected get password(): AbstractControl {
    return this.form.controls.password;
  }

  /** Whether to surface validation errors for a control yet. */
  protected showError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || this.submitted());
  }

  protected onSubmit(): void {
    this.signedIn.set(false);

    if (this.form.invalid) {
      this.submitted.set(true);
      this.form.markAllAsTouched();
      return;
    }

    // Mockup only — no backend. A real AuthService call would go here.
    console.log('Login (mock) submitted for:', this.form.controls.email.value);
    this.signedIn.set(true);
  }
}
